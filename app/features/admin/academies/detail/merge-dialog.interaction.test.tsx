/** @vitest-environment jsdom */

import { act } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import {
  clickReactDomButton,
  createReactDomTestRenderer,
  getReactDomTexts,
} from "@/lib/test-support/react-dom";

import { AcademyMergeDialog } from "./merge-dialog";

const renderer = createReactDomTestRenderer();

afterEach(() => {
  renderer.cleanup();
});

async function renderDialog() {
  const submissions: FormData[] = [];
  const router = createMemoryRouter(
    [
      {
        path: "/administracion/academias/:academyId",
        action: async ({ request }) => {
          submissions.push(await request.formData());
          return null;
        },
        element: (
          <AcademyMergeDialog
            academy={{
              contactName: "Nora Norte",
              email: "fork@example.com",
              id: "academy-fork",
              name: "Academia Fork",
              phone: "3415551234",
            }}
            merge={{
              candidates: [
                {
                  email: "original@example.com",
                  id: "academy-original",
                  name: "Academia Original",
                },
              ],
              holdings: {
                choreographies: 1,
                comprobantes: 0,
                dancers: 3,
                payments: 2,
                professors: 0,
              },
            }}
            onOpenChange={() => {}}
            open
          />
        ),
      },
    ],
    { initialEntries: ["/administracion/academias/academy-fork"] },
  );

  await renderer.renderAsync(<RouterProvider router={router} />);

  return submissions;
}

async function pickSurvivor() {
  await clickReactDomButton("Elegir");

  const option = document.querySelector<HTMLElement>('[role="option"]');

  await act(async () => {
    option?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });
}

describe("AcademyMergeDialog", () => {
  test("offers the other academies by name and access email", async () => {
    await renderDialog();
    await clickReactDomButton("Elegir");

    expect(getReactDomTexts('[role="option"]')).toEqual([
      "Academia Original · original@example.com",
    ]);
  });

  test("summarises what moves and that the removed user stops working", async () => {
    await renderDialog();
    await pickSurvivor();

    expect(getReactDomTexts("li")).toEqual([
      "3 bailarines.",
      "1 coreografía.",
      "2 pagos.",
      "Las inscripciones a seminarios de esas personas.",
      "Academia Fork: nombre y datos de contacto.",
      "El usuario de acceso fork@example.com, que deja de poder ingresar.",
    ]);
  });

  test("posts the merge intent with the removed and the surviving academy", async () => {
    const submissions = await renderDialog();

    await pickSurvivor();
    await clickReactDomButton("Fusionar", { exact: true });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(submissions.map((data) => Object.fromEntries(data))).toEqual([
      {
        id: "academy-fork",
        intent: "merge-academy",
        survivorId: "academy-original",
      },
    ]);
  });
});

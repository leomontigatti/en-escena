/** @vitest-environment jsdom */

import { act } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import { RosterMergeDialog } from "@/features/admin/merge/roster-dialog";
import type { RosterMergeCandidate } from "@/lib/roster/roster-merge.shared";
import {
  clickReactDomButton,
  createReactDomTestRenderer,
  getReactDomTexts,
} from "@/lib/test-support/react-dom";

const renderer = createReactDomTestRenderer();

afterEach(() => {
  renderer.cleanup();
});

const candidates: RosterMergeCandidate[] = [
  {
    active: true,
    documentNumber: "30111222",
    firstName: "Ana",
    id: "dancer-survivor",
    lastName: "Paz",
  },
  {
    active: false,
    documentNumber: null,
    firstName: "Bea",
    id: "dancer-undocumented",
    lastName: "Sosa",
  },
];

async function renderDialog(input: { refusal?: string } = {}) {
  const submissions: FormData[] = [];
  const router = createMemoryRouter(
    [
      {
        path: "/administracion/bailarines/:dancerId",
        action: async ({ request }) => {
          submissions.push(await request.formData());
          return null;
        },
        element: (
          <RosterMergeDialog
            kind="dancer"
            merge={{
              candidates,
              inscriptionsByEvent: [
                { choreographies: 2, eventName: "Regional 2026", seminars: 1 },
              ],
            }}
            onOpenChange={() => {}}
            open
            person={{
              documentNumber: "30111223",
              firstName: "Anita",
              id: "dancer-removed",
              lastName: "Paz",
            }}
            refusal={input.refusal}
          />
        ),
      },
    ],
    { initialEntries: ["/administracion/bailarines/dancer-removed"] },
  );

  await renderer.renderAsync(<RouterProvider router={router} />);

  return submissions;
}

async function pickSurvivor(label: string) {
  await clickReactDomButton("Elegir");

  const option = Array.from(
    document.querySelectorAll<HTMLElement>('[role="option"]'),
  ).find((candidate) => candidate.textContent === label);

  if (!option) {
    throw new Error(`Expected the option "${label}" to be offered.`);
  }

  await act(async () => {
    option.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });
}

describe("RosterMergeDialog", () => {
  test("offers the academy's other dancers, archived ones marked", async () => {
    await renderDialog();
    await clickReactDomButton("Elegir");

    expect(getReactDomTexts('[role="option"]')).toEqual([
      "Paz, Ana · 30111222",
      "Sosa, Bea · sin documento · archivado",
    ]);
  });

  test("summarises what moves and what is discarded once a survivor is chosen", async () => {
    await renderDialog();
    await pickSurvivor("Paz, Ana · 30111222");

    expect(document.body.textContent).toContain("Pasa a Ana Paz");
    expect(document.body.textContent).toContain(
      "Regional 2026: 2 coreografías y 1 seminario.",
    );
    expect(document.body.textContent).toContain(
      "Anita Paz: nombre, fecha de nacimiento, estado de alta y documento.",
    );
  });

  test("hands the document to a survivor that has none", async () => {
    await renderDialog();
    await pickSurvivor("Sosa, Bea · sin documento · archivado");

    expect(document.body.textContent).toContain(
      "El documento 30111223, sus imágenes y su verificación pasan a Bea Sosa, que no tiene documento.",
    );
    expect(document.body.textContent).toContain(
      "Anita Paz: nombre, fecha de nacimiento, estado de alta.",
    );
  });

  test("posts the merge intent with the removed and the surviving dancer", async () => {
    const submissions = await renderDialog();

    await pickSurvivor("Paz, Ana · 30111222");
    await clickReactDomButton("Fusionar", { exact: true });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(submissions).toHaveLength(1);
    expect(Object.fromEntries(submissions[0])).toEqual({
      id: "dancer-removed",
      intent: "merge-dancer",
      survivorId: "dancer-survivor",
    });
  });

  test("does not post without a survivor", async () => {
    const submissions = await renderDialog();

    await clickReactDomButton("Fusionar", { exact: true });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(submissions).toHaveLength(0);
    expect(document.body.textContent).toContain("Elegí con quién fusionar.");
  });

  test("shows the server's refusal in place of the warning", async () => {
    await renderDialog({
      refusal:
        "No se puede fusionar: los dos están en «Fuego». Quitá a uno de la coreografía antes de fusionar.",
    });

    expect(document.body.textContent).toContain(
      "No se puede fusionar: los dos están en «Fuego».",
    );
    expect(document.body.textContent).not.toContain(
      "Esta acción es irreversible.",
    );
  });
});

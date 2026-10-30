/** @vitest-environment jsdom */

import { act, useState } from "react";
import { createMemoryRouter, redirect, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import { NewMovementRouteView } from "@/features/admin/payments/create/view";
import {
  clickReactDomButton,
  createReactDomTestRenderer,
  findButton,
  setInputValue,
  updateReactDomForm,
} from "@/lib/test-support/react-dom";

const renderer = createReactDomTestRenderer();

afterEach(renderer.cleanup);

const createPath = "/administracion/movimientos/nuevo";

describe("the movement creation form", () => {
  test("keeps `Guardar` off until something is typed, and `Descartar cambios` empties it again", async () => {
    await renderPage();

    expect(isSaveEnabled()).toBe(false);
    expect(findButton("Descartar cambios")).toBeUndefined();

    await typeAmount("15000");

    expect(isSaveEnabled()).toBe(true);

    await clickReactDomButton("Descartar cambios");

    expect(readAmount().value).toBe("");
    expect(isSaveEnabled()).toBe(false);
  });

  test("asks before leaving with something typed, and not before leaving an empty form", async () => {
    const page = await renderPage();

    await clickBack();

    expect(findDialog()).toBeUndefined();
    expect(page.pathname()).toBe("/administracion/movimientos");

    await page.router.navigate(createPath);
    await settle();
    await typeAmount("15000");
    await clickBack();

    expect(findDialog()?.textContent).toContain("¿Descartar los cambios?");
    expect(page.pathname()).toBe(createPath);
  });

  test("posts the kind with the rest of the form", async () => {
    const submissions: FormData[] = [];
    await renderPage({ submissions });

    await typeAmount("15000");
    await clickReactDomButton("Guardar", { exact: true });
    await settle();

    expect(submissions[0]?.get("movementKind")).toBe("payment");
    expect(submissions[0]?.get("intent")).toBe("create-movement");
  });

  test("keeps the refused kind when a later save crashes, so a retyped refund is not saved as a payment", async () => {
    const refused = {
      fieldErrors: {},
      message: "El reembolso no puede superar el saldo disponible de $ 3.000.",
      status: "error" as const,
      values: { ...emptyValues, amount: "15000", movementKind: "refund" },
    };
    let answer = (_: ActionData) => {};
    function AnsweringPage() {
      const [actionData, setActionData] = useState<ActionData>(refused);
      answer = setActionData;

      return (
        <NewMovementRouteView actionData={actionData} loaderData={loaderData} />
      );
    }
    const router = createMemoryRouter(
      [{ element: <AnsweringPage />, path: createPath }],
      { initialEntries: [createPath] },
    );
    await renderer.renderAsync(<RouterProvider router={router} />);
    await settle();

    await act(async () => {
      // A crash answers with a message alone (`recoverableClientAction`).
      answer({ message: "Algo salió mal.", status: "error" } as ActionData);
    });
    await settle();

    expect(readAmount().value).toBe("15000");
    expect(document.querySelector('[role="combobox"]')?.textContent).toContain(
      "Reembolso",
    );
  });

  test("lets the save redirect to the new payment without asking", async () => {
    const page = await renderPage();

    await typeAmount("15000");
    await clickReactDomButton("Guardar", { exact: true });
    await settle();

    expect(findDialog()).toBeUndefined();
    expect(page.pathname()).toBe("/administracion/movimientos/pagos/payment_1");
  });

  test("keeps `Guardar` on after a refused save, with what was typed still in the form", async () => {
    await renderPage({
      actionData: {
        fieldErrors: {},
        message: "No pudimos registrar el pago.",
        status: "error",
        values: { ...emptyValues, amount: "15000" },
      },
    });
    await settle();

    expect(readAmount().value).toBe("15000");
    expect(isSaveEnabled()).toBe(true);
  });
});

const emptyValues = {
  academyId: "academy_1",
  amount: "",
  internalNote: "",
  movementKind: "payment",
  paymentDate: "2026-05-10",
  paymentMethod: "transferencia",
  reference: "",
};

type ActionData = Parameters<typeof NewMovementRouteView>[0]["actionData"];

const loaderData = {
  academies: [
    {
      contactName: "Ana Fork",
      id: "academy_1",
      kind: "academy" as const,
      name: "Academia Fork",
    },
  ],
  selectedEventId: "event_1",
  values: emptyValues,
};

async function renderPage({
  actionData,
  submissions = [],
}: {
  actionData?: ActionData;
  submissions?: FormData[];
} = {}) {
  // The form posts to the URL the document says, which the memory router does
  // not set.
  window.history.replaceState(null, "", createPath);

  const router = createMemoryRouter(
    [
      { element: <p>Lista</p>, path: "/administracion/movimientos" },
      {
        element: <p>Detalle</p>,
        path: "/administracion/movimientos/pagos/payment_1",
      },
      {
        action: async ({ request }) => {
          submissions.push(await request.formData());

          return redirect("/administracion/movimientos/pagos/payment_1");
        },
        element: (
          <NewMovementRouteView
            actionData={actionData}
            loaderData={loaderData}
          />
        ),
        path: createPath,
      },
    ],
    { initialEntries: [createPath] },
  );

  await renderer.renderAsync(<RouterProvider router={router} />);

  return { pathname: () => router.state.location.pathname, router };
}

function readAmount() {
  const input = document.querySelector<HTMLInputElement>(
    'input[name="amount"]',
  );

  if (!input) {
    throw new Error("Expected the amount input.");
  }

  return input;
}

async function typeAmount(value: string) {
  await updateReactDomForm(() => {
    setInputValue(readAmount(), value);
  });
}

function isSaveEnabled() {
  const button = findButton("Guardar", { exact: true });

  return button !== undefined && !(button as HTMLButtonElement).disabled;
}

function findDialog() {
  return (
    document.querySelector<HTMLElement>('[role="alertdialog"]') ?? undefined
  );
}

async function clickBack() {
  await act(async () => {
    document
      .querySelector("a[href='/administracion/movimientos']")
      ?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, button: 0, cancelable: true }),
      );
  });
  await settle();
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

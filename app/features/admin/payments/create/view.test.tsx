/** @vitest-environment jsdom */

import { act } from "react";
import { createMemoryRouter, redirect, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import { NewPaymentRouteView } from "@/features/admin/payments/create/view";
import {
  clickReactDomButton,
  createReactDomTestRenderer,
  findButton,
  setInputValue,
  updateReactDomForm,
} from "@/lib/test-support/react-dom";

const renderer = createReactDomTestRenderer();

afterEach(renderer.cleanup);

const createPath = "/administracion/pagos/nuevo";

describe("the payment creation form", () => {
  test("keeps `Guardar` off until something is typed, and `Descartar cambios` empties it again", async () => {
    await renderPage();

    expect(isGuardarEnabled()).toBe(false);
    expect(findButton("Descartar cambios")).toBeUndefined();

    await typeAmount("15000");

    expect(isGuardarEnabled()).toBe(true);

    await clickReactDomButton("Descartar cambios");

    expect(readAmount().value).toBe("");
    expect(isGuardarEnabled()).toBe(false);
  });

  test("asks before leaving with something typed, and not before leaving an empty form", async () => {
    const page = await renderPage();

    await clickBack();

    expect(findDialog()).toBeUndefined();
    expect(page.pathname()).toBe("/administracion/pagos");

    await page.router.navigate(createPath);
    await settle();
    await typeAmount("15000");
    await clickBack();

    expect(findDialog()?.textContent).toContain("¿Descartar los cambios?");
    expect(page.pathname()).toBe(createPath);
  });

  test("lets the save redirect to the new payment without asking", async () => {
    const page = await renderPage();

    await typeAmount("15000");
    await clickReactDomButton("Guardar", { exact: true });
    await settle();

    expect(findDialog()).toBeUndefined();
    expect(page.pathname()).toBe("/administracion/pagos/payment_1");
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
    expect(isGuardarEnabled()).toBe(true);
  });
});

const emptyValues = {
  academyId: "academy_1",
  amount: "",
  internalNote: "",
  paymentDate: "2026-05-10",
  paymentMethod: "transferencia",
  reference: "",
};

async function renderPage({
  actionData,
}: {
  actionData?: Parameters<typeof NewPaymentRouteView>[0]["actionData"];
} = {}) {
  // The form posts to the URL the document says, which the memory router does
  // not set.
  window.history.replaceState(null, "", createPath);

  const router = createMemoryRouter(
    [
      { element: <p>Lista</p>, path: "/administracion/pagos" },
      { element: <p>Detalle</p>, path: "/administracion/pagos/payment_1" },
      {
        action: () => redirect("/administracion/pagos/payment_1"),
        element: (
          <NewPaymentRouteView
            actionData={actionData}
            loaderData={{
              academies: [
                {
                  contactName: "Ana Fork",
                  id: "academy_1",
                  name: "Academia Fork",
                },
              ],
              selectedEventId: "event_1",
              values: emptyValues,
            }}
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

function isGuardarEnabled() {
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
      .querySelector("a[href='/administracion/pagos']")
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

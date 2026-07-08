/** @vitest-environment jsdom */

import { act } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

import { AdministracionAcademiaCuentaCorrienteRouteView } from "./view";
import type { AccountCurrentLoaderData } from "./types";

describe("AdministracionAcademiaCuentaCorrienteRouteView", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  test("opens the register payment form from the actions menu", async () => {
    const router = createMemoryRouter(
      [
        {
          path: "/administracion/academias/:academyId",
          element: (
            <AdministracionAcademiaCuentaCorrienteRouteView
              loaderData={accountCurrentLoaderDataFixture({
                canRegisterPayments: true,
              })}
            />
          ),
        },
      ],
      {
        initialEntries: ["/administracion/academias/academy_1"],
      },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);

    expect(document.body.textContent).not.toContain("Registrar pago");
    expect(document.body.textContent).not.toContain("Emitir factura de seña");
    expect(document.body.textContent).not.toContain("Emitir factura de saldo");

    await openActionsMenu();
    await clickMenuItem("Registrar pago");

    expect(document.body.textContent).toContain("Registrar pago");
    expect(document.body.textContent).toContain("Fecha de pago");
  });

  test("renders the imputation form without a manual amount field", async () => {
    const router = createMemoryRouter(
      [
        {
          path: "/administracion/academias/:academyId",
          element: (
            <AdministracionAcademiaCuentaCorrienteRouteView
              loaderData={accountCurrentLoaderDataFixture({
                canImputePayments: true,
                activeDepositInvoices: [
                  {
                    id: "invoice_1",
                    amount: 3000,
                    appliedDepositAmount: 0,
                    choreographyFinancialState: "impaga",
                    choreographyId: "choreography_1",
                    choreographyName: "Aire",
                    administrativeDiscountAmount: null,
                    administrativeDiscountPublicLabel: null,
                    dancerDiscountAmount: null,
                    depositCompletedOn: null,
                    finalTotalAmount: null,
                    imputedAmount: 0,
                    invoiceNumber: 1,
                    invoiceType: "sena",
                    issueDate: "2026-03-20",
                    pendingAmount: 3000,
                    selectedPaymentDeadline: "2026-03-31",
                    status: "pendiente",
                    totalDiscountAmount: null,
                  },
                ],
                payments: [
                  {
                    id: "payment_1",
                    amount: 5000,
                    availableAmount: 5000,
                    imputedAmount: 0,
                    internalNote: null,
                    paymentDate: "2026-03-20",
                    paymentMethod: "transferencia",
                    paymentNumber: 1,
                    reference: null,
                  },
                ],
              })}
            />
          ),
        },
      ],
      {
        initialEntries: ["/administracion/academias/academy_1"],
      },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);

    const imputationForm = document
      .querySelector('input[name="intent"][value="impute-payment"]')
      ?.closest("form");

    if (!imputationForm) {
      throw new Error("Expected the imputation form to be rendered.");
    }

    expect(document.body.textContent).toContain("Imputar pago");
    expect(document.body.textContent).toContain("Fecha de imputación");
    expect(document.querySelector("#payment-imputation-amount")).toBeNull();
    expect(imputationForm.querySelector('input[name="amount"]')).toBeNull();
  });
});

function accountCurrentLoaderDataFixture(
  overrides: Partial<AccountCurrentLoaderData> = {},
): AccountCurrentLoaderData {
  return {
    academy: {
      contactName: "Academia Centro",
      id: "academy_1",
      name: "Academia Centro",
      phone: "11-5555-5555",
    },
    activeBalanceInvoices: [],
    activeDepositInvoices: [],
    canCorrectRecords: false,
    canImputePayments: false,
    canRegisterPayments: false,
    choreographyFinanceRows: [
      choreographyFinanceRowFixture({
        id: "choreography_1",
        name: "Aire",
      }),
      choreographyFinanceRowFixture({
        id: "choreography_2",
        name: "Tango",
      }),
    ],
    imputations: [],
    movements: [],
    payments: [],
    selectedEventId: "event_1",
    summary: {
      availableBalanceAmount: 0,
      owedAmount: { amount: 20000, status: "complete" },
      owedDepositAmount: { amount: 6000, status: "complete" },
      totalPaidAmount: 0,
    },
    ...overrides,
  };
}

function choreographyFinanceRowFixture(
  overrides: Partial<
    AccountCurrentLoaderData["choreographyFinanceRows"][number]
  > = {},
): AccountCurrentLoaderData["choreographyFinanceRows"][number] {
  return {
    basePriceAmount: { amount: 10000, status: "complete" },
    depositAmount: { amount: 3000, status: "complete" },
    depositCompletedOn: null,
    financialState: "impaga",
    groupType: "solo",
    id: "choreography",
    name: "Coreografía",
    owedAmount: { amount: 10000, status: "complete" },
    owedDepositAmount: { amount: 3000, status: "complete" },
    paidAmount: 0,
    registrationCount: 1,
    ...overrides,
  };
}

async function openActionsMenu() {
  const button = document.querySelector('button[aria-label="Acciones"]');

  if (!button) {
    throw new Error("Expected account-current actions button to be rendered.");
  }

  const pointerDown = new MouseEvent("pointerdown", {
    bubbles: true,
    button: 0,
    cancelable: true,
    ctrlKey: false,
  });
  Object.defineProperty(pointerDown, "pointerType", {
    value: "mouse",
  });

  await act(async () => {
    button.dispatchEvent(pointerDown);
    button.dispatchEvent(
      new MouseEvent("pointerup", {
        bubbles: true,
        button: 0,
        cancelable: true,
      }),
    );
    await Promise.resolve();
  });
}

async function clickMenuItem(label: string) {
  const item = Array.from(document.querySelectorAll('[role="menuitem"]')).find(
    (candidate) => candidate.textContent?.includes(label),
  );

  if (!item) {
    throw new Error(`Expected menu item "${label}" to be rendered.`);
  }

  await act(async () => {
    item.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      }),
    );
    await Promise.resolve();
  });
}

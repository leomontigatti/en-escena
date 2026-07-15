/** @vitest-environment jsdom */

import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

import { AdministracionAcademiaCuentaCorrienteRouteView } from "./view";
import type { AccountCurrentLoaderData } from "./types";

describe("AdministracionAcademiaCuentaCorrienteRouteView", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  test("hides corrections, payments, imputations, and movements from the view", async () => {
    const router = createMemoryRouter(
      [
        {
          path: "/administracion/academias/:academyId",
          element: (
            <AdministracionAcademiaCuentaCorrienteRouteView
              loaderData={accountCurrentLoaderDataFixture({
                activeDepositInvoices: [activeDepositInvoiceFixture()],
                canCorrectRecords: true,
                canImputePayments: true,
                canRegisterPayments: true,
                imputations: [imputationFixture()],
                movements: [movementFixture()],
                payments: [paymentFixture()],
                summary: {
                  availableBalanceAmount: 5000,
                  owedAmount: { amount: 10000, status: "complete" },
                  owedDepositAmount: { amount: 3000, status: "complete" },
                  totalPaidAmount: 5000,
                },
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

    const text = document.body.textContent ?? "";

    expect(text).toContain("Cuenta corriente");
    expect(text).toContain("Facturas de seña activas");
    expect(text).toContain("Seña adeudada");
    expect(text).toContain("Saldo disponible");
    expect(text).toContain("Saldo adeudado");
    expect(document.querySelector('button[aria-label="Acciones"]')).toBeNull();
    expect(text).not.toContain("Correcciones administrativas");
    expect(text).not.toContain("Anular pago");
    expect(text).not.toContain("Registrar pago");
    expect(text).not.toContain("Imputar pago");
    expect(text).not.toContain("Fecha de imputación");
    expect(text).not.toContain("Pagos activos");
    expect(text).not.toContain("Todavía no hay pagos registrados");
    expect(text).not.toContain("Imputaciones activas");
    expect(text).not.toContain("Movimientos");
    expect(text).not.toContain("Pago N° 1 registrado");
    expect(text).not.toContain("TRX-001");
  });

  test("hides the choreography selection column when list actions are disabled", async () => {
    const router = createMemoryRouter(
      [
        {
          path: "/administracion/finanzas/:academyId",
          element: (
            <AdministracionAcademiaCuentaCorrienteRouteView
              loaderData={accountCurrentLoaderDataFixture()}
              selectableChoreographyRows={false}
            />
          ),
        },
      ],
      {
        initialEntries: ["/administracion/finanzas/academy_1"],
      },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);

    expect(document.body.textContent).toContain("Aire");
    expect(
      document.querySelector(
        'button[aria-label="Seleccionar todas las filas"]',
      ),
    ).toBeNull();
    expect(
      document.querySelector('button[aria-label="Seleccionar fila"]'),
    ).toBeNull();
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

function activeDepositInvoiceFixture(
  overrides: Partial<
    AccountCurrentLoaderData["activeDepositInvoices"][number]
  > = {},
): AccountCurrentLoaderData["activeDepositInvoices"][number] {
  return {
    administrativeDiscountAmount: null,
    administrativeDiscountPublicLabel: null,
    amount: 3000,
    appliedDepositAmount: 0,
    choreographyFinancialState: "impaga",
    choreographyId: "choreography_1",
    choreographyName: "Aire",
    dancerDiscountAmount: null,
    depositCompletedOn: null,
    finalTotalAmount: null,
    id: "invoice_1",
    imputedAmount: 0,
    invoiceNumber: 1,
    invoiceType: "sena",
    issueDate: "2026-03-20",
    pendingAmount: 3000,
    selectedPaymentDeadline: "2026-03-31",
    status: "pendiente",
    totalDiscountAmount: null,
    ...overrides,
  };
}

function paymentFixture(
  overrides: Partial<AccountCurrentLoaderData["payments"][number]> = {},
): AccountCurrentLoaderData["payments"][number] {
  return {
    amount: 5000,
    availableAmount: 5000,
    id: "payment_1",
    imputedAmount: 0,
    internalNote: "Primer pago",
    paymentDate: "2026-03-20",
    paymentMethod: "transferencia",
    paymentNumber: 1,
    reference: "TRX-001",
    ...overrides,
  };
}

function imputationFixture(
  overrides: Partial<AccountCurrentLoaderData["imputations"][number]> = {},
): AccountCurrentLoaderData["imputations"][number] {
  return {
    amount: 3000,
    choreographyName: "Aire",
    id: "imputation_1",
    imputationDate: "2026-03-21",
    invoiceNumber: 1,
    paymentNumber: 1,
    ...overrides,
  };
}

function movementFixture(
  overrides: Partial<AccountCurrentLoaderData["movements"][number]> = {},
): AccountCurrentLoaderData["movements"][number] {
  return {
    actorEmail: "admin@enescena.com.ar",
    amount: 5000,
    detail: "Pago registrado · Referencia TRX-001",
    key: "payment-created-payment_1",
    label: "Pago N° 1 registrado",
    occurredOn: "2026-03-20",
    reason: null,
    ...overrides,
  };
}

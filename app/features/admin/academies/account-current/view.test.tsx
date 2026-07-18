/** @vitest-environment jsdom */

import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

import { AdministracionAcademiaCuentaCorrienteRouteView } from "./view";
import type { AccountCurrentLoaderData } from "./types";

describe("AdministracionAcademiaCuentaCorrienteRouteView", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  test("shows aggregates only, without per-document breakdown or corrections", async () => {
    const router = createMemoryRouter(
      [
        {
          path: "/administracion/academias/:academyId",
          element: (
            <AdministracionAcademiaCuentaCorrienteRouteView
              loaderData={accountCurrentLoaderDataFixture({
                summary: {
                  availableBalanceAmount: 5000,
                  owedBalanceAmount: { amount: 10000, status: "complete" },
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
    expect(text).toContain("Seña adeudada");
    expect(text).toContain("Saldo disponible");
    expect(text).toContain("Saldo adeudado");
    expect(text).toContain("Aire");
    expect(document.querySelector('button[aria-label="Acciones"]')).toBeNull();
    expect(text).not.toContain("Facturas de seña activas");
    expect(text).not.toContain("Facturas de saldo activas");
    expect(text).not.toContain("Correcciones administrativas");
    expect(text).not.toContain("Anular pago");
    expect(text).not.toContain("Imputar pago");
    expect(text).not.toContain("Fecha de imputación");
    expect(text).not.toContain("Imputaciones activas");
    expect(text).not.toContain("Movimientos");
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
    selectedEventId: "event_1",
    summary: {
      availableBalanceAmount: 0,
      owedBalanceAmount: { amount: 20000, status: "complete" },
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
    balanceAmount: { amount: 7000, status: "complete" },
    depositCompletedOn: null,
    financialState: "impaga",
    needsAttention: false,
    groupType: "solo",
    id: "choreography",
    name: "Coreografía",
    owedBalanceAmount: { amount: 0, status: "complete" },
    owedDepositAmount: { amount: 3000, status: "complete" },
    paidAmount: 0,
    registrationCount: 1,
    ...overrides,
  };
}

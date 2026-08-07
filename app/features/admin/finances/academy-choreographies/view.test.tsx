/** @vitest-environment jsdom */

import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

import { AcademyFinancesRouteView } from "./view";
import type { AcademyFinancesLoaderData } from "./types";

describe("AcademyFinancesRouteView", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  test("shows aggregates only, without per-document breakdown or corrections", async () => {
    const router = createMemoryRouter(
      [
        {
          path: "/administracion/finanzas/:academyId",
          element: (
            <AcademyFinancesRouteView
              loaderData={academyFinancesLoaderDataFixture({
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
        initialEntries: ["/administracion/finanzas/academy_1"],
      },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);

    const text = document.body.textContent ?? "";

    expect(text).toContain("Academia Centro");
    expect(text).toContain("Lista financiera de las coreografías");
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

  test("shows the total and the owed balance before the status", async () => {
    const router = createMemoryRouter(
      [
        {
          path: "/administracion/finanzas/:academyId",
          element: (
            <AcademyFinancesRouteView
              loaderData={academyFinancesLoaderDataFixture({
                choreographyFinanceRows: [
                  choreographyFinanceRowFixture({
                    depositAmount: { amount: 3000, status: "complete" },
                    id: "choreography_1",
                    name: "Aire",
                    totalAmount: { amount: 10000, status: "complete" },
                  }),
                  choreographyFinanceRowFixture({
                    id: "choreography_2",
                    name: "Tango",
                    totalAmount: {
                      amount: 7000,
                      missingPriceCount: 1,
                      status: "incomplete",
                    },
                  }),
                ],
              })}
            />
          ),
        },
      ],
      {
        initialEntries: ["/administracion/finanzas/academy_1"],
      },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);

    const headerCells = [...document.querySelectorAll("thead th")];
    const headers = headerCells.map((header) =>
      (header.textContent ?? "").trim(),
    );

    expect(headers.indexOf("Saldo adeudado")).toBe(
      headers.indexOf("Total") + 1,
    );
    expect(headers.indexOf("Estado")).toBe(
      headers.indexOf("Saldo adeudado") + 1,
    );
    expect(
      headerCells[headers.indexOf("Total")]?.querySelector("button"),
    ).toBeNull();

    const rowCells = [...document.querySelectorAll("tbody tr")].map((row) =>
      [...row.querySelectorAll("td")].map((cell) =>
        (cell.textContent ?? "").trim(),
      ),
    );
    const totalColumnIndex = headers.indexOf("Total");

    expect(rowCells[0]?.[totalColumnIndex]).toBe("$ 10.000");
    expect(rowCells[1]?.[totalColumnIndex]).toBe("Pendiente");
  });

  test("replaces the status badge with the anomaly badge when a choreography is over-allocated", async () => {
    const router = createMemoryRouter(
      [
        {
          path: "/administracion/finanzas/:academyId",
          element: (
            <AcademyFinancesRouteView
              loaderData={academyFinancesLoaderDataFixture({
                choreographyFinanceRows: [
                  choreographyFinanceRowFixture({
                    anomalies: ["overAllocated"],
                    financialStatus: "depositMet",
                    id: "choreography_1",
                    name: "Aire",
                    overAllocatedAmount: 2000,
                  }),
                  choreographyFinanceRowFixture({
                    financialStatus: "depositMet",
                    id: "choreography_2",
                    name: "Tango",
                  }),
                ],
              })}
            />
          ),
        },
      ],
      {
        initialEntries: ["/administracion/finanzas/academy_1"],
      },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);

    const badges = statusBadges();

    // Reemplaza, no acompaña: la fila sobreasignada muestra un solo badge.
    expect(badges[0]).toEqual([{ text: "Sobreasignada", destructive: true }]);
    expect(badges[1]).toEqual([{ text: "Señada", destructive: false }]);
  });

  test("never renders a choreography selection column", async () => {
    const router = createMemoryRouter(
      [
        {
          path: "/administracion/finanzas/:academyId",
          element: (
            <AcademyFinancesRouteView
              loaderData={academyFinancesLoaderDataFixture()}
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

function academyFinancesLoaderDataFixture(
  overrides: Partial<AcademyFinancesLoaderData> = {},
): AcademyFinancesLoaderData {
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
    AcademyFinancesLoaderData["choreographyFinanceRows"][number]
  > = {},
): AcademyFinancesLoaderData["choreographyFinanceRows"][number] {
  return {
    allocatedAmount: 0,
    anomalies: [],
    basePriceAmount: { amount: 10000, status: "complete" },
    depositAmount: { amount: 3000, status: "complete" },
    depositCompletedOn: null,
    financialStatus: "depositPending",
    groupType: "solo",
    id: "choreography",
    name: "Coreografía",
    overAllocatedAmount: 0,
    owedBalanceAmount: { amount: 0, status: "complete" },
    owedDepositAmount: { amount: 3000, status: "complete" },
    registrationCount: 1,
    totalAmount: { amount: 10000, status: "complete" },
    ...overrides,
  };
}

/**
 * Badges de la columna `Estado`, por fila. El test se ancla en el encabezado y
 * no en la posición de la celda.
 */
function statusBadges() {
  const headers = [...document.querySelectorAll("thead th")].map((header) =>
    (header.textContent ?? "").trim(),
  );
  const statusIndex = headers.indexOf("Estado");

  return [...document.querySelectorAll("tbody tr")].map((row) => {
    const cell = [...row.querySelectorAll("td")][statusIndex];

    return [...(cell?.querySelectorAll('[data-slot="badge"]') ?? [])].map(
      (badge) => ({
        text: (badge.textContent ?? "").trim(),
        // Token exacto: la clase base del badge menciona `destructive` en sus
        // estados `aria-invalid`, así que un `includes` daría siempre verdadero.
        destructive: badge.className.split(" ").includes("text-destructive"),
      }),
    );
  });
}

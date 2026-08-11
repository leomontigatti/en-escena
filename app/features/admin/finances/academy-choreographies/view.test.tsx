/** @vitest-environment jsdom */

import { act } from "react";
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
                  depositAmount: { amount: 9000, status: "complete" },
                  totalAmount: { amount: 30000, status: "complete" },
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

  // Los presets sobreviven **sólo** como acciones de lista, y una acción de
  // lista sin selección no tiene sobre qué actuar: el menú aparece recién
  // cuando hay filas elegidas.
  test("offers the presets only once choreographies are selected", async () => {
    await renderListIntoDocument();

    expect(document.querySelector('button[aria-label="Acciones"]')).toBeNull();

    const checkboxes = getRenderedCheckboxes();
    expect(checkboxes.length).toBe(3);

    await clickCheckbox(checkboxes[1]);

    expect(
      document.querySelector('button[aria-label="Acciones"]'),
    ).not.toBeNull();
  });

  test("pre-fills the owed deposit of the selected rows and prompts for a price", async () => {
    await renderListIntoDocument({ initialPresetStage: "deposit" });

    // El diálogo no se monta sin selección: un preset sin filas elegidas no
    // tiene cifra que precargar.
    expect(document.querySelector('[role="dialog"]')).toBeNull();

    await clickCheckbox(getRenderedCheckboxes()[1]);

    const dialogText =
      document.querySelector('[role="dialog"]')?.textContent ?? "";

    expect(dialogText).toContain("Pagar seña");
    expect(dialogText).toContain("1 coreografía elegida");
    expect(dialogText).toContain("Seña adeudada");
    expect(dialogText).toContain("$ 3.000");
    expect(dialogText).toContain("Precio");
    expect(dialogText).toContain("Mantener el precio actual");

    // Confirmar sin tocar el selector no puede repreciar nada: la cifra de
    // arriba se calculó con los precios que ya rigen, así que el pick por
    // defecto es *ninguno* y el monto escrito coincide con el mostrado.
    const priceInput = document.querySelector('input[name="price-solo"]');
    expect(priceInput).not.toBeNull();
    expect((priceInput as HTMLInputElement).value).toBe("");

    expect(
      [...document.querySelectorAll('input[name="choreographyId"]')].map(
        (input) => (input as HTMLInputElement).value,
      ),
    ).toEqual(["choreography_1"]);
  });

  // El escritor rechaza toda fila de precio atada a un cronograma que no sea el
  // de la coreografía, así que ofrecerla es ofrecer un rechazo garantizado. Con
  // la selección repartida entre dos cronogramas, lo único satisfacible para
  // todas es el precio general.
  test("offers only the price rows the writer would accept for the selection", async () => {
    await renderListIntoDocument({
      initialPresetStage: "deposit",
      loaderData: academyFinancesLoaderDataFixture({
        priceOptionsByGroupType: {
          solo: [
            {
              amount: 8000,
              id: "price_schedule_1",
              name: "Solo cronograma 1",
              paymentDeadline: null,
              scheduleId: "schedule_1",
            },
            {
              amount: 12000,
              id: "price_schedule_2",
              name: "Solo cronograma 2",
              paymentDeadline: null,
              scheduleId: "schedule_2",
            },
          ],
        },
        pricingScheduleIdByChoreography: {
          choreography_1: "schedule_1",
          choreography_2: "schedule_2",
        },
      }),
    });

    await clickCheckbox(getRenderedCheckboxes()[0]);

    const dialogText =
      document.querySelector('[role="dialog"]')?.textContent ?? "";

    // Ninguna de las dos filas sirve para las dos coreografías, así que no hay
    // selector: no se ofrece un precio que el escritor va a rechazar.
    expect(document.querySelector('input[name="price-solo"]')).toBeNull();
    expect(dialogText).toContain("cronogramas distintos");
    expect(dialogText).not.toContain("Solo cronograma 1");
    expect(dialogText).not.toContain("Solo cronograma 2");
  });

  async function renderListIntoDocument(
    props: {
      initialPresetStage?: "deposit" | "balance";
      loaderData?: AcademyFinancesLoaderData;
    } = {},
  ) {
    const router = createMemoryRouter(
      [
        {
          path: "/administracion/finanzas/:academyId",
          action: async () => null,
          element: (
            <AcademyFinancesRouteView
              initialPresetStage={props.initialPresetStage ?? null}
              loaderData={
                props.loaderData ?? academyFinancesLoaderDataFixture()
              }
            />
          ),
        },
      ],
      { initialEntries: ["/administracion/finanzas/academy_1"] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);
  }
});

function getRenderedCheckboxes() {
  return [...document.querySelectorAll('[role="checkbox"]')].filter(
    (element): element is HTMLElement => element instanceof HTMLElement,
  );
}

async function clickCheckbox(checkbox: HTMLElement) {
  await act(async () => {
    checkbox.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
    await Promise.resolve();
  });
}

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
    priceOptionsByGroupType: {
      solo: [
        {
          amount: 10000,
          id: "price_1",
          name: "Primera fecha",
          paymentDeadline: "2026-03-01",
          scheduleId: null,
        },
      ],
    },
    pricingScheduleIdByChoreography: {
      choreography_1: "schedule_1",
      choreography_2: "schedule_1",
    },
    selectedEventId: "event_1",
    summary: {
      availableBalanceAmount: 0,
      depositAmount: { amount: 18000, status: "complete" },
      totalAmount: { amount: 60000, status: "complete" },
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

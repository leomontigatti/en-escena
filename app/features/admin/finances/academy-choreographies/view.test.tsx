/** @vitest-environment jsdom */

import { act } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

import { financePresetLabels } from "./presets";
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
    // The five metrics: each threshold with its owed figure beside it and the
    // available balance at the end.
    expect(text).toContain("Seña total");
    expect(text).toContain("Seña adeudada");
    expect(text).toContain("Total");
    expect(text).toContain("Saldo adeudado");
    expect(text).toContain("Saldo disponible");
    expect(text).toContain("$ 9.000");
    expect(text).toContain("$ 30.000");
    expect(text).toContain("Aire");
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

    // It replaces, it does not accompany: the over-allocated row shows a single
    // badge.
    expect(badges[0]).toEqual([{ text: "Sobreasignada", destructive: true }]);
    expect(badges[1]).toEqual([{ text: "Señada", destructive: false }]);
  });

  // The presets survive **only** as list actions, and a list action with no
  // selection has nothing to act on. But the menu is not hidden for that: a
  // button that comes and goes does not teach what can be done here, so it stays
  // in sight with both presets disabled.
  test("keeps the actions menu visible and disables both presets without a selection", async () => {
    await renderListIntoDocument();

    expect(
      document.querySelector('button[aria-label="Acciones"]'),
    ).not.toBeNull();

    await openActionsMenu();

    expect(menuItemDisabledState()).toEqual([
      { label: financePresetLabels.deposit, disabled: true },
      { label: financePresetLabels.balance, disabled: true },
    ]);
  });

  test("enables both presets once choreographies are selected", async () => {
    await renderListIntoDocument();

    const checkboxes = getRenderedCheckboxes();
    expect(checkboxes.length).toBe(3);

    await clickCheckbox(checkboxes[1]);
    await openActionsMenu();

    expect(menuItemDisabledState()).toEqual([
      { label: financePresetLabels.deposit, disabled: false },
      { label: financePresetLabels.balance, disabled: false },
    ]);
  });

  // The two owed figures are what the collection is measured against, and the
  // collection operates on the selection: showing the academy's total while two
  // choreographies are being collected forces adding up from memory.
  test("scopes the owed metrics to the selection and restores them when it is cleared", async () => {
    await renderListIntoDocument({
      loaderData: academyFinancesLoaderDataFixture({
        choreographyFinanceRows: [
          choreographyFinanceRowFixture({
            id: "choreography_1",
            name: "Aire",
            owedBalanceAmount: { amount: 12000, status: "complete" },
            owedDepositAmount: { amount: 3000, status: "complete" },
          }),
          choreographyFinanceRowFixture({
            id: "choreography_2",
            name: "Tango",
            owedBalanceAmount: { amount: 9000, status: "complete" },
            owedDepositAmount: { amount: 4000, status: "complete" },
          }),
        ],
        summary: {
          availableBalanceAmount: 5000,
          depositAmount: { amount: 18000, status: "complete" },
          totalAmount: { amount: 60000, status: "complete" },
          owedBalanceAmount: { amount: 21000, status: "complete" },
          owedDepositAmount: { amount: 7000, status: "complete" },
          totalPaidAmount: 0,
        },
      }),
    });

    expect(metricCardText("Seña adeudada")).toContain("$ 7.000");
    expect(metricCardText("Saldo adeudado")).toContain("$ 21.000");

    await clickCheckbox(getRenderedCheckboxes()[1]);

    expect(metricCardText("Seña adeudada")).toContain("$ 3.000");
    expect(metricCardText("Saldo adeudado")).toContain("$ 12.000");

    await clickCheckbox(getRenderedCheckboxes()[2]);

    // The two chosen ones add up to the same as the whole academy, which is
    // exactly right: a complete selection is not a special case.
    expect(metricCardText("Seña adeudada")).toContain("$ 7.000");
    expect(metricCardText("Saldo adeudado")).toContain("$ 21.000");

    // The thresholds and the available balance are the whole academy's and do
    // not move.
    expect(metricCardText("Seña total")).toContain("$ 18.000");
    expect(metricCardText("Total")).toContain("$ 60.000");
    expect(metricCardText("Saldo disponible")).toContain("$ 5.000");

    await clickCheckbox(getRenderedCheckboxes()[1]);
    await clickCheckbox(getRenderedCheckboxes()[2]);

    expect(metricCardText("Seña adeudada")).toContain("$ 7.000");
    expect(metricCardText("Saldo adeudado")).toContain("$ 21.000");
  });

  test("pre-fills the owed deposit of the selected rows and prompts for a price", async () => {
    await renderListIntoDocument({ initialPresetStage: "deposit" });

    // The dialog does not mount without a selection: a preset with no rows chosen
    // has no figure to preload.
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

    // Confirming without touching the selector cannot reprice anything: the figure
    // above was computed with the prices already in force, so the default pick is
    // *none* and the amount written matches the one shown.
    const priceInput = document.querySelector('input[name="price-solo"]');
    expect(priceInput).not.toBeNull();
    expect((priceInput as HTMLInputElement).value).toBe("");

    expect(
      [...document.querySelectorAll('input[name="choreographyId"]')].map(
        (input) => (input as HTMLInputElement).value,
      ),
    ).toEqual(["choreography_1"]);
  });

  // The writer rejects every price row tied to a schedule other than the
  // choreography's, so offering it is offering a guaranteed rejection. With the
  // selection split across two schedules, the only thing satisfiable for all of
  // them is the general price.
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

    // Neither of the two rows works for both choreographies, so there is no
    // selector: a price the writer would reject is not offered.
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

function metricCardText(title: string) {
  const card = [...document.querySelectorAll('[data-slot="card"]')].find(
    (candidate) =>
      candidate
        .querySelector('[data-slot="card-title"]')
        ?.textContent?.trim() === title,
  );

  if (!card) {
    throw new Error(`Expected the "${title}" metric card to be rendered.`);
  }

  return card.textContent ?? "";
}

function menuItemDisabledState() {
  return [...document.querySelectorAll('[role="menuitem"]')].map((item) => ({
    label: (item.textContent ?? "").trim(),
    disabled: item.getAttribute("aria-disabled") === "true",
  }));
}

async function openActionsMenu() {
  const button = document.querySelector('button[aria-label="Acciones"]');

  if (!button) {
    throw new Error("Expected the actions menu button to be rendered.");
  }

  const pointerDown = new MouseEvent("pointerdown", {
    bubbles: true,
    button: 0,
    cancelable: true,
    ctrlKey: false,
  });
  Object.defineProperty(pointerDown, "pointerType", { value: "mouse" });

  await act(async () => {
    button.dispatchEvent(pointerDown);
    button.dispatchEvent(
      new MouseEvent("pointerup", {
        bubbles: true,
        button: 0,
        cancelable: true,
      }),
    );
    button.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
    await Promise.resolve();
  });
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
 * Badges of the `Estado` column, per row. The test anchors on the header and not
 * on the cell's position.
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
        // An exact token: the badge's base class mentions `destructive` in its
        // `aria-invalid` states, so an `includes` would always be true.
        destructive: badge.className.split(" ").includes("text-destructive"),
      }),
    );
  });
}

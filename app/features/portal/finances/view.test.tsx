/** @vitest-environment jsdom */

import { act } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import { emptyOperationalFinanceSummary } from "@/lib/finances/operational-summary";
import {
  createReactDomTestRenderer,
  type ReactDomTestRenderer,
  setInputValue,
  updateReactDomForm,
} from "@/lib/test-support/react-dom";

import { PortalAcademyFinancesRouteView } from "./view";
import type { loadPortalAcademyFinances } from "./server";

type LoaderData = Awaited<ReturnType<typeof loadPortalAcademyFinances>>;
type ActiveEventLoaderData = Extract<LoaderData, { activeEvent: object }>;

describe("PortalAcademyFinancesRouteView", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  // The academy reads the same list the administrator does: the number opens
  // the row, it is the only link to the detail, and it is what the list is
  // ordered by.
  test("shows the choreography number first and links to the detail from it", async () => {
    await renderPortalFinances(renderer, portalFinancesLoaderDataFixture());

    const headers = headerLabels();

    // The selection checkbox owns the first header, which carries no label.
    expect(headers[0]).toBe("");
    expect(headers[1]).toBe("#");
    expect(headers[2]).toBe("Nombre");
    // The rows arrive in the opposite order, so this only passes while the list
    // opens ordered by the number.
    expect(columnValues("#")).toEqual(["00001", "00002"]);
    expect(columnValues("Nombre")).toEqual(["Aire", "Tango"]);

    const links = [...document.querySelectorAll("tbody a")].map((link) => [
      (link.textContent ?? "").trim(),
      link.getAttribute("href"),
    ]);

    // One link per row and it is the number: the name renders as plain text
    // beside it. The positive assertion keeps the count honest.
    expect(links).toEqual([
      ["00001", "/portal/finanzas/choreography_1"],
      ["00002", "/portal/finanzas/choreography_2"],
    ]);
  });

  test("finds a choreography by its number", async () => {
    await renderPortalFinances(renderer, portalFinancesLoaderDataFixture());

    const search = document.querySelector<HTMLInputElement>(
      'input[placeholder="Buscar coreografía por número o nombre"]',
    );

    if (!search) {
      throw new Error("Expected the finances search input to be rendered.");
    }

    // Typed without the padding zeros, the way somebody reads a number off a
    // screen. The box filters a single column, so this only passes while the
    // number travels inside that column's filter value.
    await updateReactDomForm(() => {
      setInputValue(search, "2");
    });

    expect(columnValues("Nombre")).toEqual(["Tango"]);
  });

  test("filters choreographies by financial status", async () => {
    await renderPortalFinances(renderer, portalFinancesLoaderDataFixture());

    const text = document.body.textContent ?? "";

    expect(text).toContain("Estado");
    expect(text).toContain("Seña pendiente");
    expect(text).toContain("Pagada");
    expect(
      document.querySelector(
        'input[placeholder="Buscar coreografía por número o nombre"]',
      ),
    ).not.toBeNull();
  });

  // The same five the administrator reads, in the same order: each threshold
  // with its owed figure beside it, and the unallocated money last.
  test("keeps the five aggregates visible", async () => {
    await renderPortalFinances(renderer, portalFinancesLoaderDataFixture());

    const text = document.body.textContent ?? "";

    for (const metric of [
      "Seña total",
      "Seña adeudada",
      "Total",
      "Saldo adeudado",
      "Saldo disponible",
    ]) {
      expect(text).toContain(metric);
    }
  });

  // Selecting is how the academy asks what a few choreographies owe without
  // adding them up from memory. It is the administrator's behaviour minus the
  // collections: there is nothing to fire from here, so the rows only re-scope
  // the two owed figures.
  test("scopes the owed metrics to the selection and restores them when it is cleared", async () => {
    await renderPortalFinances(
      renderer,
      portalFinancesLoaderDataFixture({
        choreographyFinanceRows: [
          choreographyFinanceRowFixture({
            choreographyNumber: 1,
            id: "choreography_1",
            name: "Aire",
            depositAmount: { amount: 9000, status: "complete" },
            owedBalanceAmount: { amount: 12000, status: "complete" },
            owedDepositAmount: { amount: 3000, status: "complete" },
            totalAmount: { amount: 30000, status: "complete" },
          }),
          choreographyFinanceRowFixture({
            choreographyNumber: 2,
            id: "choreography_2",
            name: "Tango",
            depositAmount: { amount: 9000, status: "complete" },
            owedBalanceAmount: { amount: 9000, status: "complete" },
            owedDepositAmount: { amount: 4000, status: "complete" },
            totalAmount: { amount: 30000, status: "complete" },
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
    );

    expect(metricCardText("Seña adeudada")).toContain("$ 7.000");
    expect(metricCardText("Saldo adeudado")).toContain("$ 21.000");

    // The first row after the header checkbox: `Aire`, which owes 3.000 / 12.000.
    await clickCheckbox(getRenderedCheckboxes()[1]);

    expect(metricCardText("Seña adeudada")).toContain("$ 3.000");
    expect(metricCardText("Saldo adeudado")).toContain("$ 12.000");
    // The thresholds and the available balance stay the academy's: they are what
    // the debt is measured against, not part of it.
    expect(metricCardText("Seña total")).toContain("$ 18.000");
    expect(metricCardText("Total")).toContain("$ 60.000");
    expect(metricCardText("Saldo disponible")).toContain("$ 5.000");

    await clickCheckbox(getRenderedCheckboxes()[1]);

    expect(metricCardText("Seña adeudada")).toContain("$ 7.000");
    expect(metricCardText("Saldo adeudado")).toContain("$ 21.000");
  });

  // The tabs are the panel's, with the panel's rules: the four figures follow
  // the active tab, the pool above them does not, and each tab keeps its own
  // selection so coming back does not find it emptied.
  test("splits the list into `Coreografías` and `Seminarios`", async () => {
    await renderPortalFinances(renderer, portalFinancesLoaderDataFixture());

    expect(headerLabels()).toContain("Nombre");
    expect(headerLabels()).not.toContain("Seminario");

    await clickTab("Seminarios");

    // The unit's own columns, then the shared money ones, then the status.
    expect(headerLabels()).toEqual([
      "",
      "Seminario",
      "Fecha",
      "Inscriptos",
      "Seña",
      "Total",
      "Saldo adeudado",
      "Estado",
    ]);
    expect(columnValues("Seminario")).toEqual(["Abril Sosa"]);
    expect(columnValues("Inscriptos")).toEqual(["2"]);
    // The instructor is the only link out of the row.
    expect(
      [...document.querySelectorAll("tbody a")].map((link) => [
        (link.textContent ?? "").trim(),
        link.getAttribute("href"),
      ]),
    ).toEqual([["Abril Sosa", "/portal/finanzas/seminarios/seminar_1"]]);
  });

  test("moves the four metrics with the tab and leaves the pool where it is", async () => {
    await renderPortalFinances(renderer, portalFinancesLoaderDataFixture());

    // The choreography tab: the two rows of the fixture, summed.
    expect(metricCardText("Seña total")).toContain("$ 6.000");
    expect(metricCardText("Total")).toContain("$ 20.000");
    expect(metricCardText("Saldo disponible")).toContain("$ 5.000");

    await clickTab("Seminarios");

    expect(metricCardText("Seña total")).toContain("$ 2.500");
    expect(metricCardText("Seña adeudada")).toContain("$ 2.500");
    expect(metricCardText("Total")).toContain("$ 5.000");
    expect(metricCardText("Saldo adeudado")).toContain("$ 5.000");
    // One pool for both kinds, so it never moves.
    expect(metricCardText("Saldo disponible")).toContain("$ 5.000");
  });

  test("keeps one selection per tab", async () => {
    await renderPortalFinances(renderer, portalFinancesLoaderDataFixture());

    await clickCheckbox(getRenderedCheckboxes()[1]);

    const owedAfterSelection = metricCardText("Saldo adeudado");

    await clickTab("Seminarios");

    // The seminar tab opens with nothing selected, so it shows its own total.
    expect(metricCardText("Saldo adeudado")).toContain("$ 5.000");

    await clickTab("Coreografías");

    // And the choreography selection survived the round trip.
    expect(metricCardText("Saldo adeudado")).toBe(owedAfterSelection);
  });

  test("shows the empty state when there is no active event", async () => {
    await renderPortalFinances(renderer, {
      activeEvent: null,
      choreographyFinanceRows: [],
      seminarFinanceRows: [],
      summary: emptyOperationalFinanceSummary(),
    });

    expect(document.body.textContent).toContain(
      "Todavía no hay un evento activo",
    );
  });
});

function getRenderedCheckboxes() {
  return [...document.querySelectorAll('[role="checkbox"]')].filter(
    (element): element is HTMLElement => element instanceof HTMLElement,
  );
}

/** Clicks a tab trigger by its label, the way the academy switches sections. */
async function clickTab(label: string) {
  const tab = [...document.querySelectorAll('[role="tab"]')].find(
    (candidate) => (candidate.textContent ?? "").trim() === label,
  );

  if (!(tab instanceof HTMLElement)) {
    throw new Error(`Expected a "${label}" tab to be rendered.`);
  }

  // Radix activates a trigger on `mousedown`, so the click alone would leave
  // the tab where it was.
  await act(async () => {
    tab.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        button: 0,
      }),
    );
    tab.dispatchEvent(
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

function headerLabels() {
  return [...document.querySelectorAll("thead th")].map((header) =>
    (header.textContent ?? "").trim(),
  );
}

/** Every cell of one column, read by header label rather than by position. */
function columnValues(header: string) {
  const columnIndex = headerLabels().indexOf(header);

  if (columnIndex === -1) {
    throw new Error(`Expected a "${header}" column to be rendered.`);
  }

  return [...document.querySelectorAll("tbody tr")].map((row) =>
    (row.querySelectorAll("td")[columnIndex]?.textContent ?? "").trim(),
  );
}

// Renders through the renderer the suite already cleans in `afterEach`: a
// renderer created here would leave its root mounted, and the router
// subscription it keeps alive can schedule work after jsdom teardown.
async function renderPortalFinances(
  renderer: ReactDomTestRenderer,
  loaderData: LoaderData,
) {
  const router = createMemoryRouter(
    [
      {
        path: "/portal/finanzas",
        element: <PortalAcademyFinancesRouteView loaderData={loaderData} />,
      },
    ],
    { initialEntries: ["/portal/finanzas"] },
  );

  await renderer.renderAsync(<RouterProvider router={router} />);
}

function portalFinancesLoaderDataFixture(
  overrides: Partial<ActiveEventLoaderData> = {},
): ActiveEventLoaderData {
  return {
    activeEvent: {
      id: "event_1",
      name: "Evento 2026",
      active: true,
      registrationStartsAt: new Date("2026-01-01T00:00:00Z"),
      registrationEndsAt: new Date("2026-02-01T00:00:00Z"),
      startsAt: new Date("2026-03-01T00:00:00Z"),
      endsAt: new Date("2026-03-02T00:00:00Z"),
    },
    choreographyFinanceRows: [
      choreographyFinanceRowFixture({
        choreographyNumber: 2,
        id: "choreography_2",
        name: "Tango",
        financialStatus: "paidInFull",
      }),
      choreographyFinanceRowFixture({
        choreographyNumber: 1,
        id: "choreography_1",
        name: "Aire",
        financialStatus: "depositPending",
      }),
    ],
    seminarFinanceRows: [seminarFinanceRowFixture()],
    summary: {
      availableBalanceAmount: 5000,
      depositAmount: { amount: 9000, status: "complete" },
      totalAmount: { amount: 30000, status: "complete" },
      owedBalanceAmount: { amount: 10000, status: "complete" },
      owedDepositAmount: { amount: 3000, status: "complete" },
      totalPaidAmount: 5000,
    },
    ...overrides,
  };
}

function seminarFinanceRowFixture(
  overrides: Partial<LoaderData["seminarFinanceRows"][number]> = {},
): LoaderData["seminarFinanceRows"][number] {
  return {
    academyId: "academy_1",
    allocatedAmount: 0,
    anomalies: [],
    basePriceAmount: { amount: 5000, status: "complete" },
    depositAmount: { amount: 2500, status: "complete" },
    financialStatus: "depositPending",
    id: "seminar_1",
    overAllocatedAmount: 0,
    instructorName: "Abril Sosa",
    owedBalanceAmount: { amount: 5000, status: "complete" },
    owedDepositAmount: { amount: 2500, status: "complete" },
    registrationCount: 2,
    scheduledDate: "2026-10-10",
    totalAmount: { amount: 5000, status: "complete" },
    ...overrides,
  };
}

function choreographyFinanceRowFixture(
  overrides: Partial<LoaderData["choreographyFinanceRows"][number]> = {},
): LoaderData["choreographyFinanceRows"][number] {
  return {
    allocatedAmount: 0,
    anomalies: [],
    basePriceAmount: { amount: 10000, status: "complete" },
    choreographyNumber: 1,
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

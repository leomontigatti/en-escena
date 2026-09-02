/** @vitest-environment jsdom */

import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import { emptyOperationalFinanceSummary } from "@/lib/finances/operational-summary";
import {
  createReactDomTestRenderer,
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
    await renderPortalFinances(portalFinancesLoaderDataFixture());

    const headers = headerLabels();

    expect(headers[0]).toBe("#");
    expect(headers[1]).toBe("Nombre");
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
    await renderPortalFinances(portalFinancesLoaderDataFixture());

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
    await renderPortalFinances(portalFinancesLoaderDataFixture());

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

  test("keeps the aggregates visible", async () => {
    await renderPortalFinances(portalFinancesLoaderDataFixture());

    const text = document.body.textContent ?? "";

    expect(text).toContain("Seña adeudada");
    expect(text).toContain("Saldo disponible");
    expect(text).toContain("Saldo adeudado");
  });

  test("shows the empty state when there is no active event", async () => {
    await renderPortalFinances({
      activeEvent: null,
      choreographyFinanceRows: [],
      summary: emptyOperationalFinanceSummary(),
    });

    expect(document.body.textContent).toContain(
      "Todavía no hay un evento activo",
    );
  });
});

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

async function renderPortalFinances(loaderData: LoaderData) {
  const renderer = createReactDomTestRenderer();
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

/** @vitest-environment jsdom */

import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import { emptyOperationalFinanceSummary } from "@/lib/finances/operational-summary";
import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

import { PortalAcademyFinancesRouteView } from "./view";
import type { loadPortalAcademyFinances } from "./server";

type LoaderData = Awaited<ReturnType<typeof loadPortalAcademyFinances>>;
type ActiveEventLoaderData = Extract<LoaderData, { activeEvent: object }>;

describe("PortalAcademyFinancesRouteView", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  test("links each choreography to its finance detail", async () => {
    await renderPortalFinances(portalFinancesLoaderDataFixture());

    const link = document.querySelector(
      'a[href="/portal/finanzas/choreography_1"]',
    );

    expect(link?.textContent).toContain("Aire");
  });

  test("filters choreographies by financial state", async () => {
    await renderPortalFinances(portalFinancesLoaderDataFixture());

    const text = document.body.textContent ?? "";

    expect(text).toContain("Estado");
    expect(text).toContain("Impaga");
    expect(text).toContain("Pagada");
    expect(
      document.querySelector(
        'input[placeholder="Buscar coreografía por nombre"]',
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
        id: "choreography_1",
        name: "Aire",
        financialState: "impaga",
      }),
      choreographyFinanceRowFixture({
        id: "choreography_2",
        name: "Tango",
        financialState: "pagada",
      }),
    ],
    summary: {
      availableBalanceAmount: 5000,
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

/** @vitest-environment jsdom */

import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test } from "vitest";

import { PortalChoreographyFinanceDetailRouteView } from "./view";
import type { loadPortalChoreographyFinanceDetail } from "./server";

type LoaderData = Awaited<
  ReturnType<typeof loadPortalChoreographyFinanceDetail>
>;
type InscriptionRow = LoaderData["inscriptions"][number];

describe("PortalChoreographyFinanceDetailRouteView", () => {
  test("styles the amount columns by column and never by row", () => {
    const pending = amountColumnStyles(
      renderDetail({
        inscriptions: [
          inscriptionFixture({ financialStatus: "depositPending" }),
        ],
      }),
    );
    const paid = amountColumnStyles(
      renderDetail({
        inscriptions: [inscriptionFixture({ financialStatus: "paidInFull" })],
      }),
    );

    // Every figure the academy reads is exact and is exactly what they have to
    // pay, so the decoration cannot depend on the row's state.
    expect(pending).toEqual(paid);
    expect(pending).toEqual({
      "Precio base": { muted: false },
      Seña: { muted: false },
      Total: { muted: true },
    });
  });

  test("does not label any amount as provisional", () => {
    const markup = renderDetail({
      inscriptions: [inscriptionFixture({ financialStatus: "depositPending" })],
    });

    expect(markup).not.toContain("provisori");
    expect(markup).not.toContain("estimad");
  });
});

function renderDetail(overrides: Partial<LoaderData> = {}) {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: (
          <PortalChoreographyFinanceDetailRouteView
            loaderData={loaderDataFixture(overrides)}
          />
        ),
      },
    ],
    { initialEntries: ["/"] },
  );

  return renderToStaticMarkup(<RouterProvider router={router} />);
}

function loaderDataFixture(overrides: Partial<LoaderData> = {}): LoaderData {
  return {
    choreography: {
      allocatedAmount: 3000,
      depositAmount: { amount: 3000, status: "complete" },
      financialStatus: "depositMet",
      groupType: "duo",
      id: "choreography_1",
      name: "Aire",
      owedBalanceAmount: { amount: 7000, status: "complete" },
      totalAmount: { amount: 10000, status: "complete" },
    },
    inscriptions: [inscriptionFixture()],
    ...overrides,
  };
}

function inscriptionFixture(
  overrides: Partial<InscriptionRow> = {},
): InscriptionRow {
  return {
    allocatedAmount: 3000,
    anomalies: [],
    basePriceAmount: 10000,
    dancerId: "dancer_1",
    depositAmount: 3000,
    discountAmount: 0,
    financialStatus: "depositMet",
    firstName: "Ana",
    inscriptionId: "inscription_1",
    lastName: "López",
    overAllocatedAmount: 0,
    owedBalanceAmount: 7000,
    owedDepositAmount: 0,
    totalAmount: 10000,
    withdrawn: false,
    ...overrides,
  };
}

/**
 * Maps each amount column of the inscription row to its decoration. It anchors on
 * the header and not on the cell's position.
 */
function amountColumnStyles(markup: string) {
  const document = new DOMParser().parseFromString(markup, "text/html");
  const table = document.querySelector('[aria-label="Inscripciones"] table');
  const headers = [...(table?.querySelectorAll("thead th") ?? [])].map(
    (header) => header.textContent?.trim() ?? "",
  );
  const cells = [...(table?.querySelectorAll("tbody tr td") ?? [])];

  return Object.fromEntries(
    ["Precio base", "Seña", "Total"].map((column) => {
      const cell = cells[headers.indexOf(column)];

      if (!cell) {
        throw new Error(`Expected a cell for the column "${column}".`);
      }

      return [
        column,
        { muted: cell.classList.contains("text-muted-foreground") },
      ];
    }),
  );
}

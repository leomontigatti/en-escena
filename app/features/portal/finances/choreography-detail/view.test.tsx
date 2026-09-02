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
      Seña: { muted: false },
      Total: { muted: true },
      "Saldo adeudado": { muted: false },
    });
  });

  // The number the academy quotes when it asks about a choreography, titled the
  // same way the administrator's finance detail titles it.
  test("titles the detail with the choreography name and number", () => {
    const title = renderDetail().match(
      /id="finanzas-coreografia-title"[^>]*>([^<]*)</,
    );

    expect(title?.[1]).toBe("Aire # 00001");
  });

  // The same five the administrator reads, in the same order: each threshold
  // with its owed figure beside it, and the academy's available balance last.
  test("shows the five metrics and the same inscription columns as the admin", () => {
    const markup = renderDetail();

    for (const metric of [
      "Seña total",
      "Seña adeudada",
      "Total",
      "Saldo adeudado",
      "Saldo disponible",
    ]) {
      expect(markup).toContain(metric);
    }

    // `Saldo disponible` is the academy's, not the choreography's.
    expect(markup).toContain("$ 5.000");
    expect(inscriptionHeaders()).toEqual([
      "Bailarín",
      "Precio",
      "Seña",
      "Total",
      "Saldo adeudado",
      "Estado",
    ]);
    // The effective price by name: which of the event's prices governs the row.
    expect(markup).toContain("Primer vencimiento");
  });

  // The two things the academy does not get: the emission lives with the
  // administrator, and so does the money dialog the dancer's name opens.
  test("leaves out the emission action and the dancer's money dialog", () => {
    const markup = renderDetail();

    expect(markup).not.toContain("Emitir factura");
    expect(markup).not.toContain("Acciones");
    // Present as plain text, and the negative assertion is anchored on the row
    // so it cannot pass by the name having disappeared.
    expect(markup).toContain("Ana López");
    expect(dancerCellMarkup()).not.toContain("<button");
    expect(dancerCellMarkup()).not.toContain("<a ");
  });

  test("warns about over-allocated money without sending the academy to fix it", () => {
    const markup = renderDetail({
      choreography: choreographyFixture({ anomalies: ["overAllocated"] }),
    });

    expect(markup).toContain(
      "Hay inscripciones con más dinero asignado que su total",
    );
    // The academy cannot move an allocation, so the alert points at
    // administración instead of at a list they cannot act on.
    expect(markup).toContain("administración");
    expect(markup).not.toContain("Podés corregirlo");
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
    availableBalanceAmount: 5000,
    choreography: choreographyFixture(),
    inscriptions: [inscriptionFixture()],
    ...overrides,
  };
}

function choreographyFixture(
  overrides: Partial<LoaderData["choreography"]> = {},
): LoaderData["choreography"] {
  return {
    allocatedAmount: 3000,
    anomalies: [],
    choreographyNumber: 1,
    depositAmount: { amount: 3000, status: "complete" },
    financialStatus: "depositMet",
    groupType: "duo",
    id: "choreography_1",
    name: "Aire",
    overAllocatedAmount: 0,
    owedBalanceAmount: { amount: 7000, status: "complete" },
    owedDepositAmount: { amount: 0, status: "complete" },
    totalAmount: { amount: 10000, status: "complete" },
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
    effectivePrice: {
      amount: 10000,
      depositAmount: 3000,
      id: "price_1",
      name: "Primer vencimiento",
    },
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

function inscriptionsTable(markup = renderDetail()) {
  const document = new DOMParser().parseFromString(markup, "text/html");
  const table = document.querySelector('[aria-label="Inscripciones"] table');

  if (!table) {
    throw new Error("Expected the inscriptions table to be rendered.");
  }

  return table;
}

function inscriptionHeaders(markup?: string) {
  return [...inscriptionsTable(markup).querySelectorAll("thead th")].map(
    (header) => header.textContent?.trim() ?? "",
  );
}

/** The `Bailarín` cell of the single row, read by header and not by position. */
function dancerCellMarkup(markup?: string) {
  const table = inscriptionsTable(markup);
  const columnIndex = inscriptionHeaders(markup).indexOf("Bailarín");
  const cell = [...table.querySelectorAll("tbody tr td")][columnIndex];

  if (!cell) {
    throw new Error("Expected the dancer cell to be rendered.");
  }

  return cell.innerHTML;
}

/**
 * Maps each amount column of the inscription row to its decoration. It anchors on
 * the header and not on the cell's position.
 */
function amountColumnStyles(markup: string) {
  const table = inscriptionsTable(markup);
  const headers = inscriptionHeaders(markup);
  const cells = [...table.querySelectorAll("tbody tr td")];

  return Object.fromEntries(
    ["Seña", "Total", "Saldo adeudado"].map((column) => {
      const cell = cells[headers.indexOf(column)];

      if (!cell) {
        throw new Error(`No se encontró la columna "${column}".`);
      }

      return [
        column,
        { muted: cell.classList.contains("text-muted-foreground") },
      ];
    }),
  );
}

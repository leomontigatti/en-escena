/** @vitest-environment jsdom */

import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";

import { FinancesListRouteView } from "./view";
import type { FinanceAccountRow } from "./server";

describe("FinancesListRouteView", () => {
  test("renders one row per academy with the three primary amounts", () => {
    const markup = renderList([
      accountRowFixture({
        academyName: "Conservatorio Para Bailarines",
        owedDepositAmount: { amount: 135000, status: "complete" },
        availableBalanceAmount: 0,
        owedBalanceAmount: { amount: 315000, status: "complete" },
      }),
    ]);

    expect(markup).toContain("Seña adeudada");
    expect(markup).toContain("Saldo disponible");
    expect(markup).toContain("Saldo adeudado");
    expect(markup).toContain("Conservatorio Para Bailarines");
    expect(markup).toContain("$ 135.000");
    expect(markup).toContain("$ 315.000");
  });

  test("mutes balance available when the academy has no money on account", () => {
    const markup = renderList([
      accountRowFixture({ availableBalanceAmount: 0 }),
    ]);

    expect(isAvailableBalanceMuted(markup)).toBe(true);
  });

  test("does not mute balance available when the academy has money on account", () => {
    const markup = renderList([
      accountRowFixture({ availableBalanceAmount: 34500 }),
    ]);

    expect(isAvailableBalanceMuted(markup)).toBe(false);
    expect(markup).toContain("$ 34.500");
  });
});

/**
 * It anchors on the "Saldo disponible" header rather than on the cell's position,
 * so the test keeps talking about the column if the order changes.
 */
function isAvailableBalanceMuted(markup: string) {
  const document = new DOMParser().parseFromString(markup, "text/html");
  const headers = [...document.querySelectorAll("thead th")].map(
    (header) => header.textContent?.trim() ?? "",
  );
  const cells = [...document.querySelectorAll("tbody tr td")];
  const cell = cells[headers.indexOf("Saldo disponible")];

  if (!cell) {
    throw new Error('Expected a cell for the column "Saldo disponible".');
  }

  return cell.querySelector(".text-muted-foreground") !== null;
}

function renderList(rows: FinanceAccountRow[]) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={["/administracion/finanzas"]}>
      <FinancesListRouteView
        loaderData={{ rows, selectedEventId: "event_1" }}
      />
    </MemoryRouter>,
  );
}

function accountRowFixture(
  overrides: Partial<FinanceAccountRow> = {},
): FinanceAccountRow {
  return {
    academyId: "academy_1",
    academyName: "Academia Centro",
    availableBalanceAmount: 0,
    owedBalanceAmount: { amount: 7000, status: "complete" },
    owedDepositAmount: { amount: 3000, status: "complete" },
    ...overrides,
  };
}

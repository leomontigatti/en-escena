/** @vitest-environment jsdom */

import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";

import { FinancesListRouteView } from "./view";
import type { FinanceAccountRow } from "./server";

describe("FinancesListRouteView", () => {
  test("renders one row per academy with the four primary amounts", () => {
    const markup = renderList([
      accountRowFixture({
        academyName: "Conservatorio Para Bailarines",
        depositAmount: { amount: 135000, status: "complete" },
        totalAmount: { amount: 450000, status: "complete" },
        availableBalanceAmount: 0,
        owedBalanceAmount: { amount: 315000, status: "complete" },
      }),
    ]);

    expect(markup).toContain("Seña");
    expect(markup).toContain("Total");
    expect(markup).toContain("Saldo adeudado");
    expect(markup).toContain("Saldo disponible");
    expect(markup).toContain("Conservatorio Para Bailarines");
    expect(markup).toContain("$ 135.000");
    expect(markup).toContain("$ 450.000");
    expect(markup).toContain("$ 315.000");
  });
});

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
    depositAmount: { amount: 3000, status: "complete" },
    totalAmount: { amount: 10000, status: "complete" },
    owedBalanceAmount: { amount: 7000, status: "complete" },
    ...overrides,
  };
}

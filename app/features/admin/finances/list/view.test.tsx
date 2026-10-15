/** @vitest-environment jsdom */

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test } from "vitest";

import { FinancesListRouteView } from "./view";
import type { FinanceAccountRow } from "./server";
import { renderInDataRouter } from "@/lib/test-support/data-router";
import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

describe("FinancesListRouteView", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

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

  // ADR-0019: an individual's money is operated like an academy's, so both
  // kinds share the list and `Tipo` tells them apart.
  test("badges each row's kind and filters by `Tipo`", async () => {
    const rows = [
      accountRowFixture({
        academyId: "academy_1",
        academyName: "Academia Sur",
      }),
      accountRowFixture({
        academyId: "individual_1",
        academyName: "Ana Pérez",
        kind: "individual",
      }),
    ];

    await renderer.renderAsync(
      renderInDataRouter(
        "/administracion/finanzas",
        <FinancesListRouteView
          loaderData={{ rows, selectedEventId: "event_1" }}
        />,
      ),
    );

    expect(columnValues("Tipo")).toEqual(["Academia", "Particular"]);

    renderer.cleanup();
    await renderer.renderAsync(
      renderInDataRouter(
        "/administracion/finanzas?tipo=particular",
        <FinancesListRouteView
          loaderData={{ rows, selectedEventId: "event_1" }}
        />,
      ),
    );

    expect(columnValues("Nombre")).toEqual(["Ana Pérez"]);
  });
});

function columnValues(header: string) {
  const headers = [...document.querySelectorAll("thead th")].map((cell) =>
    (cell.textContent ?? "").trim(),
  );
  const columnIndex = headers.indexOf(header);

  if (columnIndex === -1) {
    throw new Error(`Expected a "${header}" column to be rendered.`);
  }

  return [...document.querySelectorAll("tbody tr")].map((row) =>
    (row.querySelectorAll("td")[columnIndex]?.textContent ?? "").trim(),
  );
}

function renderList(rows: FinanceAccountRow[]) {
  return renderToStaticMarkup(
    renderInDataRouter(
      "/administracion/finanzas",
      <FinancesListRouteView
        loaderData={{ rows, selectedEventId: "event_1" }}
      />,
    ),
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
    kind: "academy",
    totalAmount: { amount: 10000, status: "complete" },
    owedBalanceAmount: { amount: 7000, status: "complete" },
    ...overrides,
  };
}

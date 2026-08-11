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

  test("mutes Total for every row and leaves Saldo disponible in default text", () => {
    const markup = renderList([
      accountRowFixture({ availableBalanceAmount: 0 }),
      accountRowFixture({
        academyId: "academy_2",
        academyName: "Academia Norte",
        availableBalanceAmount: 34500,
      }),
    ]);

    expect(isColumnMuted(markup, "Total")).toBe(true);
    expect(isColumnMuted(markup, "Saldo disponible")).toBe(false);
    expect(markup).toContain("$ 34.500");
  });
});

/**
 * Se ancla en el encabezado en vez de en la posición de la celda, para que el
 * test siga hablando de la columna si el orden cambia. El gris es de la columna
 * entera, así que se lee en el `className` del encabezado y de sus celdas.
 */
function isColumnMuted(markup: string, header: string) {
  const document = new DOMParser().parseFromString(markup, "text/html");
  const headers = [...document.querySelectorAll("thead th")];
  const index = headers.findIndex(
    (candidate) => candidate.textContent?.trim() === header,
  );

  if (index === -1) {
    throw new Error(`No se encontró la columna "${header}".`);
  }

  const rows = [...document.querySelectorAll("tbody tr")];
  const cells = rows.map((row) => [...row.querySelectorAll("td")][index]);

  return cells.every(
    (cell) =>
      cell !== undefined &&
      (cell.classList.contains("text-muted-foreground") ||
        cell.querySelector(".text-muted-foreground") !== null),
  );
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
    depositAmount: { amount: 3000, status: "complete" },
    totalAmount: { amount: 10000, status: "complete" },
    owedBalanceAmount: { amount: 7000, status: "complete" },
    ...overrides,
  };
}

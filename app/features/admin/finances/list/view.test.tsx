/** @vitest-environment jsdom */

import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";

import { AdministracionFinanzasRouteView } from "./view";
import type { FinanceAccountRow } from "./server";

describe("AdministracionFinanzasRouteView", () => {
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

  test("mutes Saldo disponible when the academy has no money on account", () => {
    const markup = renderList([
      accountRowFixture({ availableBalanceAmount: 0 }),
    ]);

    expect(isAvailableBalanceMuted(markup)).toBe(true);
  });

  test("does not mute Saldo disponible when the academy has money on account", () => {
    const markup = renderList([
      accountRowFixture({ availableBalanceAmount: 34500 }),
    ]);

    expect(isAvailableBalanceMuted(markup)).toBe(false);
    expect(markup).toContain("$ 34.500");
  });
});

/**
 * Se ancla en el encabezado "Saldo disponible" en vez de en la posición de la
 * celda, para que el test siga hablando de la columna si el orden cambia.
 */
function isAvailableBalanceMuted(markup: string) {
  const document = new DOMParser().parseFromString(markup, "text/html");
  const headers = [...document.querySelectorAll("thead th")].map(
    (header) => header.textContent?.trim() ?? "",
  );
  const cells = [...document.querySelectorAll("tbody tr td")];
  const cell = cells[headers.indexOf("Saldo disponible")];

  if (!cell) {
    throw new Error('No se encontró la columna "Saldo disponible".');
  }

  return cell.querySelector(".text-muted-foreground") !== null;
}

function renderList(rows: FinanceAccountRow[]) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={["/administracion/finanzas"]}>
      <AdministracionFinanzasRouteView
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

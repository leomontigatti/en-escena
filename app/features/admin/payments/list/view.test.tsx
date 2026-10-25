/** @vitest-environment jsdom */

import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test } from "vitest";

import { MovementsListRouteView } from "./view";
import {
  movementsListLoaderDataFixture,
  movementsListFiltersFixture,
  paymentRowFixture,
  refundRowFixture,
} from "./view.test-support";
import type { MovementsListLoaderData } from "./server";

describe("MovementsListRouteView", () => {
  // The administrator selects to read: the cards above re-scope to what is
  // ticked. What the sums come to is `resolveSelectedMovementTotals`' own
  // test; this one asserts the column is there to tick at all.
  test("offers a checkbox on every row and one to select the page", () => {
    const markup = render();

    expect(markup).toContain('aria-label="Seleccionar todas las filas"');
    expect(markup).toContain('aria-label="Seleccionar fila"');
  });

  test("offers `Nuevo pago` to the administrator and not to the auditor", () => {
    expect(render()).toContain("Nuevo pago");
    expect(
      render(movementsListLoaderDataFixture({ canWrite: false })),
    ).not.toContain("Nuevo pago");
  });

  // Amounts are positive on both kinds, so the badge is what tells a refund
  // from a payment, and a refund has no `Disponible` to show.
  test("tells a refund from a payment by its badge, with no `Disponible` on the refund", () => {
    renderInto(
      movementsListLoaderDataFixture({
        rows: [
          refundRowFixture({ amount: 2500 }),
          paymentRowFixture({ amount: 10000, availableAmount: 0 }),
        ],
      }),
    );

    expect(tableRows()).toEqual([
      [
        "",
        "Reembolso",
        "00001",
        "17 de marzo de 2026",
        "Academia Norte",
        "Efectivo",
        "$ 2.500",
        "",
      ],
      [
        "",
        "Pago",
        "00001",
        "15 de marzo de 2026",
        "Academia Norte",
        "Transferencia",
        "$ 10.000",
        "$ 0",
      ],
    ]);
  });

  test("links a payment to its page and opens a refund in place", () => {
    renderInto(
      movementsListLoaderDataFixture({
        rows: [refundRowFixture(), paymentRowFixture()],
      }),
    );

    const [refundRow, paymentRow] = document.querySelectorAll("tbody tr");

    expect(refundRow?.querySelector("a")).toBeNull();
    expect(
      [...(refundRow?.querySelectorAll("button") ?? [])].map(
        (button) => button.textContent,
      ),
    ).toContain("00001");
    expect(paymentRow?.querySelector("a")?.getAttribute("href")).toBe(
      "/administracion/movimientos/pagos/payment_1",
    );
  });

  // What is asserted here is the wiring: a narrowed list shows the filter it is
  // narrowed by, which is what tells the reader the figures below are not the
  // whole event.
  test("carries the kind and availability filters into the facets", () => {
    expect(render()).not.toContain("data-filter-group");

    const markup = render(
      movementsListLoaderDataFixture({
        filters: {
          ...movementsListFiltersFixture(),
          availability: "con",
          kind: "refund",
        },
      }),
    );

    expect(markup).toContain('aria-label="Disponible: Con disponible"');
    expect(markup).toContain('aria-label="Tipo: Reembolso"');
  });

  // The cards read the event, not the page and not the filtered set, so the
  // administrator reads the position first and narrows to it second.
  test("shows the event's payments, refunds, net and available totals", () => {
    const markup = render(
      movementsListLoaderDataFixture({
        summary: {
          availableAmount: 4000,
          netAmount: 12500,
          paymentsAmount: 15000,
          refundsAmount: 2500,
        },
      }),
    );

    for (const text of [
      "Pagos",
      "$ 15.000",
      "Reembolsos",
      "$ 2.500",
      "Neto",
      "$ 12.500",
      "Disponible",
      "$ 4.000",
    ]) {
      expect(markup).toContain(text);
    }
  });

  // An event with nothing collected yet still has a position, and it is `$ 0`.
  // The cards state it beside the empty state instead of disappearing with the
  // table, which would leave the administrator guessing at the figure.
  test("states the zero position on an event with no movements", () => {
    const markup = render(
      movementsListLoaderDataFixture({
        hasAnyMovement: false,
        rows: [],
        summary: {
          availableAmount: 0,
          netAmount: 0,
          paymentsAmount: 0,
          refundsAmount: 0,
        },
        totalCount: 0,
      }),
    );

    expect(markup).toContain("Neto");
    expect(markup).toContain("$ 0");
    // The table is what goes away, not the position above it.
    expect(markup).toContain("Todavía no hay movimientos.");
  });

  // A filter that matched nothing must not fall back to the "no movements
  // yet" empty state: the cards and the facet are how the reader undoes it.
  test("keeps the table visible when the kind facet empties it", () => {
    const markup = render(
      movementsListLoaderDataFixture({
        filters: { ...movementsListFiltersFixture(), kind: "refund" },
        hasAnyMovement: false,
        rows: [],
      }),
    );

    expect(markup).toContain(
      "No hay movimientos que coincidan con la búsqueda o los filtros.",
    );
    expect(markup).not.toContain("Todavía no hay movimientos.");
  });
});

function routerFor(loaderData: MovementsListLoaderData) {
  return createMemoryRouter(
    [
      {
        path: "/",
        element: <MovementsListRouteView loaderData={loaderData} />,
      },
    ],
    { initialEntries: ["/"] },
  );
}

function render(
  loaderData: MovementsListLoaderData = movementsListLoaderDataFixture(),
) {
  return renderToStaticMarkup(
    <RouterProvider router={routerFor(loaderData)} />,
  );
}

function renderInto(loaderData: MovementsListLoaderData) {
  document.body.innerHTML = render(loaderData);
}

function tableRows() {
  return [...document.querySelectorAll("tbody tr")].map((row) =>
    [...row.querySelectorAll("td")].map((cell) =>
      (cell.textContent ?? "").trim(),
    ),
  );
}

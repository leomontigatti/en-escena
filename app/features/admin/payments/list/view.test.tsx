/** @vitest-environment jsdom */

import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test } from "vitest";

import { MovementsListRouteView } from "./view";
import {
  movementsListLoaderDataFixture,
  movementsListFiltersFixture,
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

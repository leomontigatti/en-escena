/** @vitest-environment jsdom */

import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test } from "vitest";

import { PaymentsListRouteView } from "./view";
import type { PaymentsListLoaderData, PaymentsListRow } from "./server";

describe("PaymentsListRouteView", () => {
  // `Disponible` sits to the right of the amount it is a remainder of, and the
  // amount keeps its own name: `Monto` is one payment's figure, not a total.
  test('shows "Disponible" right after "Monto"', () => {
    expect(headers()).toEqual([
      "#",
      "Fecha",
      "Academia",
      "Medio de pago",
      "Monto",
      "Disponible",
    ]);
  });

  test("shows what is still free on each payment", () => {
    const markup = render(
      loaderDataFixture({
        rows: [
          rowFixture({ amount: 10000, availableAmount: 4000 }),
          rowFixture({
            amount: 5000,
            availableAmount: 0,
            id: "payment_2",
            paymentNumber: 2,
          }),
        ],
      }),
    );

    expect(markup).toContain("$ 4.000");
    // A fully applied payment reads `$ 0` and not a dash: the zero is the
    // answer, not a missing value.
    expect(markup).toContain("$ 0");
  });

  // The same reading as `Total` / `Saldo adeudado` on the finance lists: the
  // context column is muted and the actionable one is not.
  test("mutes the amount column and emphasises the remainder", () => {
    expect(amountColumnStyles()).toEqual({
      Monto: { emphasised: false, muted: true },
      Disponible: { emphasised: true, muted: false },
    });
  });

  // The facet's options only mount once the menu is opened, so what is asserted
  // here is the wiring: a narrowed list says so on the filter trigger, which is
  // what tells the reader the figures below are not the whole event.
  test("carries the availability filter into the facet", () => {
    expect(render()).toContain('aria-label="Filtros"');
    expect(
      render(
        loaderDataFixture({
          filters: { ...filtersFixture(), availability: "con" },
        }),
      ),
    ).toContain('aria-label="Filtros: Disponible: Con disponible"');
  });

  // The cards read the event, not the page and not the filtered set, so the
  // administrator reads the position first and narrows to it second.
  test("shows the event's collected and available totals", () => {
    const markup = render(
      loaderDataFixture({
        summary: { availableAmount: 4000, totalAmount: 15000 },
      }),
    );

    expect(markup).toContain("Total cobrado");
    expect(markup).toContain("$ 15.000");
    expect(markup).toContain("Disponible");
    expect(markup).toContain("$ 4.000");
  });

  // An event with nothing collected yet still has a position, and it is `$ 0`.
  // The cards state it beside the empty state instead of disappearing with the
  // table, which would leave the administrator guessing at the figure.
  test("states the zero position on an event with no payments", () => {
    const markup = render(
      loaderDataFixture({
        hasAnyPayment: false,
        rows: [],
        summary: { availableAmount: 0, totalAmount: 0 },
        totalCount: 0,
      }),
    );

    expect(markup).toContain("Total cobrado");
    expect(markup).toContain("Disponible");
    expect(markup).toContain("$ 0");
    // The table is what goes away, not the position above it.
    expect(markup).toContain("Todavía no hay pagos registrados");
  });

  // A filter that matched nothing must not fall back to the "no payments yet"
  // empty state: the cards and the facet are how the reader undoes it.
  test("keeps the table visible when the availability facet empties it", () => {
    const markup = render(
      loaderDataFixture({
        filters: { ...filtersFixture(), availability: "con" },
        hasAnyPayment: false,
        rows: [],
      }),
    );

    expect(markup).toContain("Total cobrado");
    expect(markup).not.toContain("Todavía no hay pagos registrados");
  });
});

function render(loaderData: PaymentsListLoaderData = loaderDataFixture()) {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: <PaymentsListRouteView loaderData={loaderData} />,
      },
    ],
    { initialEntries: ["/"] },
  );

  return renderToStaticMarkup(<RouterProvider router={router} />);
}

function filtersFixture(): PaymentsListLoaderData["filters"] {
  return {
    availability: null,
    method: null,
    order: { columnId: "paymentDate", direction: "desc" },
    page: 1,
    query: "",
  };
}

function loaderDataFixture(
  overrides: Partial<PaymentsListLoaderData> = {},
): PaymentsListLoaderData {
  return {
    filters: filtersFixture(),
    hasAnyPayment: true,
    rows: [rowFixture()],
    selectedEventId: "event_1",
    summary: { availableAmount: 4000, totalAmount: 10000 },
    totalCount: 1,
    totalPages: 1,
    ...overrides,
  };
}

function rowFixture(overrides: Partial<PaymentsListRow> = {}): PaymentsListRow {
  return {
    academyId: "academy_1",
    academyName: "Academia Norte",
    amount: 10000,
    availableAmount: 4000,
    id: "payment_1",
    paymentDate: "2026-03-15",
    paymentMethod: "transferencia",
    paymentNumber: 1,
    ...overrides,
  };
}

function table(markup = render()) {
  const document = new DOMParser().parseFromString(markup, "text/html");
  const rendered = document.querySelector("table");

  if (!rendered) {
    throw new Error("Expected the payments table to be rendered.");
  }

  return rendered;
}

function headers(markup?: string) {
  return [...table(markup).querySelectorAll("thead th")].map(
    (header) => header.textContent?.trim() ?? "",
  );
}

/** Each amount column's decoration, read by header and never by position. */
function amountColumnStyles(markup?: string) {
  const rendered = table(markup);
  const columnHeaders = headers(markup);
  const cells = [...rendered.querySelectorAll("tbody tr td")];

  return Object.fromEntries(
    ["Monto", "Disponible"].map((column) => {
      const cell = cells[columnHeaders.indexOf(column)];

      if (!cell) {
        throw new Error(`Expected a cell for the column "${column}".`);
      }

      return [
        column,
        {
          emphasised: cell.classList.contains("font-medium"),
          muted: cell.classList.contains("text-muted-foreground"),
        },
      ];
    }),
  );
}

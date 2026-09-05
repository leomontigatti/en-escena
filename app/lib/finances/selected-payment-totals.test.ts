import { describe, expect, test } from "vitest";

import { resolveSelectedPaymentTotals } from "./selected-payment-totals";

const rows = [
  { amount: 10000, availableAmount: 4000, id: "a" },
  { amount: 5000, availableAmount: 0, id: "b" },
  { amount: 2500, availableAmount: 2500, id: "c" },
];

// The event's whole position, which is what the loader sends and what the cards
// open on. Deliberately not the sum of `rows`: the page is one page of many, so
// a summary that happened to match would not prove the fallback is the summary.
const summary = { availableAmount: 9000, totalAmount: 40000 };

describe("resolveSelectedPaymentTotals", () => {
  test("falls back to the event's position with nothing selected", () => {
    const totals = resolveSelectedPaymentTotals({
      rows,
      selectedRowIds: [],
      summary,
    });

    expect(totals).toEqual({
      availableAmount: 9000,
      hasSelection: false,
      totalAmount: 40000,
    });
  });

  test("sums only the selected rows", () => {
    const totals = resolveSelectedPaymentTotals({
      rows,
      selectedRowIds: ["a", "c"],
      summary,
    });

    expect(totals).toEqual({
      availableAmount: 6500,
      hasSelection: true,
      totalAmount: 12500,
    });
  });

  // A fully applied payment contributes a real zero to `Disponible`, so the
  // card reads `$ 0` and not the event's figure: the selection is not empty.
  test("keeps a selection whose available amounts are all zero", () => {
    const totals = resolveSelectedPaymentTotals({
      rows,
      selectedRowIds: ["b"],
      summary,
    });

    expect(totals).toEqual({
      availableAmount: 0,
      hasSelection: true,
      totalAmount: 5000,
    });
  });

  // The list is server-paginated, so an id can outlive the page it came from.
  // Ignoring it is what keeps the cards summing only what is on screen.
  test("ignores an id that is not on the page", () => {
    const totals = resolveSelectedPaymentTotals({
      rows,
      selectedRowIds: ["a", "gone"],
      summary,
    });

    expect(totals).toEqual({
      availableAmount: 4000,
      hasSelection: true,
      totalAmount: 10000,
    });
  });
});

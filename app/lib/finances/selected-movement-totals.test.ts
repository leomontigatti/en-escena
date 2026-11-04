import { describe, expect, test } from "vitest";

import {
  movementRowKey,
  resolveSelectedMovementTotals,
} from "./selected-movement-totals";

const rows = [
  { amount: 10000, availableAmount: 4000, id: "a", kind: "payment" },
  { amount: 5000, availableAmount: 0, id: "b", kind: "payment" },
  { amount: 2500, availableAmount: null, id: "c", kind: "refund" },
  { amount: 1500, availableAmount: null, id: "d", kind: "refund" },
] as const;

// The event's whole position, which is what the loader sends and what the cards
// open on. Deliberately not the sum of `rows`: the page is one page of many, so
// a summary that happened to match would not prove the fallback is the summary.
const summary = {
  availableAmount: 9000,
  netAmount: 32000,
  paymentsAmount: 40000,
  refundsAmount: 8000,
};

function keysOf(...ids: string[]) {
  return rows
    .filter((row) => ids.includes(row.id))
    .map((row) => movementRowKey(row));
}

describe("resolveSelectedMovementTotals", () => {
  test("falls back to the event's position with nothing selected", () => {
    const totals = resolveSelectedMovementTotals({
      rows,
      selectedRowKeys: [],
      summary,
    });

    expect(totals).toEqual({ ...summary, hasSelection: false });
  });

  // The three figures the `Recaudación` workbook closes with, over the ticked
  // rows: money in, money out, and what is left of it.
  test("sums payments and refunds apart, and nets them", () => {
    const totals = resolveSelectedMovementTotals({
      rows,
      selectedRowKeys: keysOf("a", "c", "d"),
      summary,
    });

    expect(totals).toEqual({
      availableAmount: 4000,
      hasSelection: true,
      netAmount: 6000,
      paymentsAmount: 10000,
      refundsAmount: 4000,
    });
  });

  // A refund carries no `Disponible`, so a selection of refunds alone reads a
  // real zero there and a negative net: more went out than these brought in.
  test("reads a selection of refunds alone", () => {
    const totals = resolveSelectedMovementTotals({
      rows,
      selectedRowKeys: keysOf("c"),
      summary,
    });

    expect(totals).toEqual({
      availableAmount: 0,
      hasSelection: true,
      netAmount: -2500,
      paymentsAmount: 0,
      refundsAmount: 2500,
    });
  });

  // A fully applied payment contributes a real zero to `Disponible`, so the
  // card reads `$ 0` and not the event's figure: the selection is not empty.
  test("keeps a selection whose available amounts are all zero", () => {
    const totals = resolveSelectedMovementTotals({
      rows,
      selectedRowKeys: keysOf("b"),
      summary,
    });

    expect(totals).toEqual({
      availableAmount: 0,
      hasSelection: true,
      netAmount: 5000,
      paymentsAmount: 5000,
      refundsAmount: 0,
    });
  });

  // The list is server-paginated, so a key can outlive the page it came from.
  // Ignoring it is what keeps the cards summing only what is on screen.
  test("ignores a key that is not on the page", () => {
    const totals = resolveSelectedMovementTotals({
      rows,
      selectedRowKeys: [...keysOf("a"), "payment:gone"],
      summary,
    });

    expect(totals).toEqual({
      availableAmount: 4000,
      hasSelection: true,
      netAmount: 10000,
      paymentsAmount: 10000,
      refundsAmount: 0,
    });
  });

  // A payment and a refund count in series of their own, so only the kind
  // tells two rows apart: the key is never the id alone.
  test("keys a row by its kind and its id", () => {
    expect(movementRowKey({ id: "x", kind: "payment" })).not.toBe(
      movementRowKey({ id: "x", kind: "refund" }),
    );
  });
});

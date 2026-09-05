import { describe, expect, test } from "vitest";

import {
  completeOperationalFinanceAmount,
  incompleteOperationalFinanceAmount,
} from "./operational-summary";
import { resolveSelectedOperationalTotals } from "./selected-operational-totals";

const rows = [
  row({ id: "a", owedBalance: 1000, owedDeposit: 300 }),
  row({ id: "b", owedBalance: 2000, owedDeposit: 700 }),
  row({ id: "c", owedBalance: 4000, owedDeposit: 900 }),
];

const summary = {
  owedBalanceAmount: completeOperationalFinanceAmount(7000),
  owedDepositAmount: completeOperationalFinanceAmount(1900),
};

describe("resolveSelectedOperationalTotals", () => {
  // No selection is the academy's whole debt: the figure the list opens on.
  test("falls back to the summary with nothing selected", () => {
    const totals = resolveSelectedOperationalTotals({
      rows,
      selectedRowIds: [],
      summary,
    });

    expect(totals.hasSelection).toBe(false);
    expect(totals.selectedRows).toEqual([]);
    expect(totals.owedBalanceAmount).toEqual(summary.owedBalanceAmount);
    expect(totals.owedDepositAmount).toEqual(summary.owedDepositAmount);
  });

  test("sums only the selected rows", () => {
    const totals = resolveSelectedOperationalTotals({
      rows,
      selectedRowIds: ["a", "c"],
      summary,
    });

    expect(totals.hasSelection).toBe(true);
    expect(totals.selectedRows.map((selected) => selected.id)).toEqual([
      "a",
      "c",
    ]);
    expect(totals.owedBalanceAmount).toEqual(
      completeOperationalFinanceAmount(5000),
    );
    expect(totals.owedDepositAmount).toEqual(
      completeOperationalFinanceAmount(1200),
    );
  });

  // An id that is no longer in the list —a row filtered away, or a stale
  // selection after a revalidation— must not make the figure disappear.
  test("ignores a selected id that is not among the rows", () => {
    const totals = resolveSelectedOperationalTotals({
      rows,
      selectedRowIds: ["b", "gone"],
      summary,
    });

    expect(totals.selectedRows.map((selected) => selected.id)).toEqual(["b"]);
    expect(totals.owedBalanceAmount).toEqual(
      completeOperationalFinanceAmount(2000),
    );
  });

  // A choreography with no price has nothing to owe, and the sum says so rather
  // than reporting the rest as if it were the whole.
  test("carries an incomplete amount into the selected sum", () => {
    const totals = resolveSelectedOperationalTotals({
      rows: [
        rows[0],
        {
          id: "sin-precio",
          owedBalanceAmount: incompleteOperationalFinanceAmount({
            amount: 0,
            missingPriceCount: 1,
          }),
          owedDepositAmount: completeOperationalFinanceAmount(0),
        },
      ],
      selectedRowIds: ["a", "sin-precio"],
      summary,
    });

    expect(totals.owedBalanceAmount.status).toBe("incomplete");
    expect(totals.owedDepositAmount).toEqual(
      completeOperationalFinanceAmount(300),
    );
  });
});

function row(input: { id: string; owedBalance: number; owedDeposit: number }) {
  return {
    id: input.id,
    owedBalanceAmount: completeOperationalFinanceAmount(input.owedBalance),
    owedDepositAmount: completeOperationalFinanceAmount(input.owedDeposit),
  };
}

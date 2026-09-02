import {
  sumOperationalFinanceAmounts,
  type OperationalFinanceAmount,
} from "@/lib/finances/operational-summary";

type OwedAmounts = {
  owedBalanceAmount: OperationalFinanceAmount;
  owedDepositAmount: OperationalFinanceAmount;
};

/**
 * What the two owed metrics of a financial list read, given what is selected.
 *
 * **Only the owed figures re-scope.** `Seña total`, `Total` and `Saldo
 * disponible` stay the academy's: the first two are thresholds —they say what
 * was agreed, not what is missing— and the available balance is money that
 * belongs to no choreography. Narrowing those would answer a question nobody
 * asks.
 *
 * With nothing selected the figures fall back to the summary, so an empty
 * selection and no selection read the same. Both lists share this because both
 * ask the same question of a selection —how much do *these* owe— even though
 * only the administrator can then act on the answer.
 *
 * A plain function and not a hook: it holds no state, and the selection it
 * reads is already lifted into the view that owns it.
 */
export function resolveSelectedOperationalTotals<
  TRow extends OwedAmounts & { id: string },
>(input: {
  rows: TRow[];
  selectedRowIds: string[];
  summary: OwedAmounts;
}): OwedAmounts & { hasSelection: boolean; selectedRows: TRow[] } {
  const selectedRows = input.rows.filter((row) =>
    input.selectedRowIds.includes(row.id),
  );
  const hasSelection = selectedRows.length > 0;

  return {
    hasSelection,
    owedBalanceAmount: hasSelection
      ? sumOperationalFinanceAmounts(
          selectedRows.map((row) => row.owedBalanceAmount),
        )
      : input.summary.owedBalanceAmount,
    owedDepositAmount: hasSelection
      ? sumOperationalFinanceAmounts(
          selectedRows.map((row) => row.owedDepositAmount),
        )
      : input.summary.owedDepositAmount,
    selectedRows,
  };
}

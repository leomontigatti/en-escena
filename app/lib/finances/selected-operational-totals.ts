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

/**
 * The four figures of a kind's tab: each of them summed over that tab's rows
 * alone. `Saldo disponible` is not here on purpose — it is the academy's pool,
 * one for both kinds, and it never moves with the tab.
 *
 * The tabs sum on the client rather than asking the loader for a per-kind
 * summary because the summary the loader builds is the academy's one debt over
 * both kinds (`OperationalFinanceSummary`), and splitting it is a surface
 * concern. Summing here with the same owner the selection uses is what keeps a
 * tab's heading and its table from disagreeing.
 */
export function sumOperationalFinanceRows(
  rows: readonly {
    depositAmount: OperationalFinanceAmount;
    owedBalanceAmount: OperationalFinanceAmount;
    owedDepositAmount: OperationalFinanceAmount;
    totalAmount: OperationalFinanceAmount;
  }[],
): {
  depositAmount: OperationalFinanceAmount;
  owedBalanceAmount: OperationalFinanceAmount;
  owedDepositAmount: OperationalFinanceAmount;
  totalAmount: OperationalFinanceAmount;
} {
  return {
    depositAmount: sumOperationalFinanceAmounts(
      rows.map((row) => row.depositAmount),
    ),
    owedBalanceAmount: sumOperationalFinanceAmounts(
      rows.map((row) => row.owedBalanceAmount),
    ),
    owedDepositAmount: sumOperationalFinanceAmounts(
      rows.map((row) => row.owedDepositAmount),
    ),
    totalAmount: sumOperationalFinanceAmounts(
      rows.map((row) => row.totalAmount),
    ),
  };
}

type PaymentTotals = {
  availableAmount: number;
  totalAmount: number;
};

/**
 * What the two payment metrics read, given what is selected. It is the payments
 * list's counterpart to `resolveSelectedOperationalTotals`, and it answers the
 * same question a selection asks there: how much do *these* rows come to.
 *
 * **Both figures re-scope**, unlike the operational lists where only the owed
 * pair does. Neither of these is a threshold: `Total cobrado` and `Disponible`
 * are both sums over payments, so summing the selected ones is the same
 * question asked of fewer rows.
 *
 * With nothing selected the figures fall back to the summary, so an empty
 * selection and no selection read the same — and the summary is the event's
 * whole position, which is what the cards say when nobody has narrowed them.
 */
export function resolveSelectedPaymentTotals<
  TRow extends { amount: number; availableAmount: number; id: string },
>(input: {
  rows: TRow[];
  selectedRowIds: string[];
  summary: PaymentTotals;
}): PaymentTotals & { hasSelection: boolean } {
  const selectedRows = input.rows.filter((row) =>
    input.selectedRowIds.includes(row.id),
  );
  const hasSelection = selectedRows.length > 0;

  if (!hasSelection) {
    return { ...input.summary, hasSelection };
  }

  return {
    availableAmount: sumBy(selectedRows, (row) => row.availableAmount),
    hasSelection,
    totalAmount: sumBy(selectedRows, (row) => row.amount),
  };
}

function sumBy<TRow>(rows: TRow[], read: (row: TRow) => number) {
  return rows.reduce((total, row) => total + read(row), 0);
}

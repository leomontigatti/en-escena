import type { MovementKind } from "@/lib/finances/movement-kinds";

type MovementTotals = {
  availableAmount: number;
  netAmount: number;
  paymentsAmount: number;
  refundsAmount: number;
};

type TotalledMovement = {
  amount: number;
  /** A payment's `Disponible`; a refund has none. */
  availableAmount: number | null;
  id: string;
  kind: MovementKind;
};

/**
 * A movement's key in a list that holds both kinds. Payments and refunds live
 * in tables of their own, so the kind is part of what names a row.
 */
export function movementRowKey(row: { id: string; kind: MovementKind }) {
  return `${row.kind}:${row.id}`;
}

/**
 * What the movement metrics read, given what is selected: `Pagos`,
 * `Reembolsos` and `Neto` —the three figures the `Recaudación` workbook closes
 * with— and the payments' `Disponible`. It is the movements list's counterpart
 * to `resolveSelectedOperationalTotals`, and it answers the question a
 * selection asks there: how much do *these* rows come to.
 *
 * **Every figure re-scopes.** None of them is a threshold: each is a sum over
 * movements, so summing the selected ones is the same question asked of fewer
 * rows. Amounts are positive on both kinds; the kind decides which figure a
 * row adds to, and `Neto` is what the selected payments leave after the
 * selected refunds, negative when refunds alone are ticked.
 *
 * With nothing selected the figures fall back to the summary, so an empty
 * selection and no selection read the same — and the summary is the event's
 * whole position, which is what the cards say when nobody has narrowed them.
 */
export function resolveSelectedMovementTotals<
  TRow extends TotalledMovement,
>(input: {
  rows: readonly TRow[];
  selectedRowKeys: string[];
  summary: MovementTotals;
}): MovementTotals & { hasSelection: boolean } {
  const selectedRows = input.rows.filter((row) =>
    input.selectedRowKeys.includes(movementRowKey(row)),
  );
  const hasSelection = selectedRows.length > 0;

  if (!hasSelection) {
    return { ...input.summary, hasSelection };
  }

  const paymentsAmount = sumBy(selectedRows, (row) =>
    row.kind === "payment" ? row.amount : 0,
  );
  const refundsAmount = sumBy(selectedRows, (row) =>
    row.kind === "refund" ? row.amount : 0,
  );

  return {
    availableAmount: sumBy(selectedRows, (row) => row.availableAmount ?? 0),
    hasSelection,
    netAmount: paymentsAmount - refundsAmount,
    paymentsAmount,
    refundsAmount,
  };
}

function sumBy<TRow>(rows: readonly TRow[], read: (row: TRow) => number) {
  return rows.reduce((total, row) => total + read(row), 0);
}

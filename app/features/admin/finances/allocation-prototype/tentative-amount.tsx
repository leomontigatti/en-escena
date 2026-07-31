/**
 * THROWAWAY PROTOTYPE — a figure that is still moving, shown muted.
 *
 * A figure is **tentative** while the money behind it has not arrived: `Seña`
 * reads as a demand until the threshold is met, `Saldo adeudado` until the row
 * is paid in full. Muting says which numbers are still in play without spending
 * a column on it, and it costs nothing when they settle — the figures are all
 * derived, so this clears itself along with them.
 *
 * Shared by both tables, which is the point: the same reading has to look the
 * same whether it is one inscription or a whole choreography.
 */
import { formatAmount } from "../formatters";

export function TentativeAmount({
  amount,
  isTentative,
}: {
  amount: number;
  isTentative: boolean;
}) {
  return (
    <span className={isTentative ? "text-muted-foreground" : undefined}>
      {formatAmount(amount)}
    </span>
  );
}

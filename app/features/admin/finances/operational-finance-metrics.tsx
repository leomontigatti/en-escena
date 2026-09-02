import { MetricCard } from "@/components/shared/metric-card";
import type { OperationalFinanceAmount } from "@/lib/finances/operational-summary";

import { formatAmount, formatOperationalAmount } from "./formatters";

/**
 * The five figures the operational finance screens are read by, in the one order
 * they are read in: each threshold with its owed figure beside it —`Seña total`
 * with `Seña adeudada`, `Total` with `Saldo adeudado`— and the available balance
 * at the end, which belongs to neither pair.
 *
 * The same component on the four screens (the two lists and the two details) is
 * what makes them one reading rather than four: an academy's list and a
 * choreography's detail differ in *what* is summed, never in which figures exist
 * or where they sit. `availableBalanceAmount` is always the academy's, even on a
 * detail — money collected and not yet allocated belongs to no choreography, and
 * it is the pool every allocation comes out of.
 */
export function OperationalFinanceMetrics({
  availableBalanceAmount,
  depositAmount,
  owedBalanceAmount,
  owedDepositAmount,
  totalAmount,
}: {
  availableBalanceAmount: number;
  depositAmount: OperationalFinanceAmount;
  owedBalanceAmount: OperationalFinanceAmount;
  owedDepositAmount: OperationalFinanceAmount;
  totalAmount: OperationalFinanceAmount;
}) {
  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <MetricCard
        title="Seña total"
        value={formatOperationalAmount(depositAmount)}
      />
      <MetricCard
        title="Seña adeudada"
        value={formatOperationalAmount(owedDepositAmount)}
      />
      <MetricCard title="Total" value={formatOperationalAmount(totalAmount)} />
      <MetricCard
        title="Saldo adeudado"
        value={formatOperationalAmount(owedBalanceAmount)}
      />
      <MetricCard
        title="Saldo disponible"
        value={formatAmount(availableBalanceAmount)}
      />
    </section>
  );
}

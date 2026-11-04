import { MetricCard } from "@/components/shared/metric-card";
import { formatAmount } from "@/lib/finances/formatters";

/**
 * The four figures a list of movements is read by: `Pagos`, `Reembolsos` and
 * `Neto` —the three the `Recaudación` workbook closes with— and the payments'
 * `Disponible`. One component for the event's movements list and an academy's
 * `Movimientos` tab, so the two read the same.
 */
export function MovementMetrics({
  availableAmount,
  netAmount,
  paymentsAmount,
  refundsAmount,
}: {
  availableAmount: number;
  netAmount: number;
  paymentsAmount: number;
  refundsAmount: number;
}) {
  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <MetricCard title="Pagos" value={formatAmount(paymentsAmount)} />
      <MetricCard title="Reembolsos" value={formatAmount(refundsAmount)} />
      <MetricCard title="Neto" value={formatAmount(netAmount)} />
      <MetricCard title="Disponible" value={formatAmount(availableAmount)} />
    </section>
  );
}

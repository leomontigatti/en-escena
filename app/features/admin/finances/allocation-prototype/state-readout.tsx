/**
 * THROWAWAY PROTOTYPE — the whole state on screen (#550).
 *
 * A prototype has to show what each action changed, so this prints the aggregate
 * figures and every payment's balance, plus the button that returns to the
 * fixture.
 */
import { Button } from "@/components/ui/button";

import { formatAmount } from "../formatters";
import { inscriptionStatusLabels } from "./fixtures";
import { resetPrototypeState, usePrototype } from "./store";

export function StateReadout() {
  const { inscriptions, payments, academy } = usePrototype();

  const counts = {
    depositPending: inscriptions.filter(
      (row) => row.status === "depositPending",
    ).length,
    depositMet: inscriptions.filter((row) => row.status === "depositMet")
      .length,
    paidInFull: inscriptions.filter((row) => row.status === "paidInFull")
      .length,
  };

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-dashed p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Estado del prototipo
        </h2>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={resetPrototypeState}
        >
          Reiniciar
        </Button>
      </div>
      <p className="text-sm tabular-nums">
        Total {formatAmount(academy.totalAmount)} · seña adeudada{" "}
        {formatAmount(academy.owedDepositAmount)} · saldo adeudado{" "}
        {formatAmount(academy.owedBalanceAmount)}
      </p>
      <p className="text-sm tabular-nums">
        {inscriptionStatusLabels.depositPending} {counts.depositPending} ·{" "}
        {inscriptionStatusLabels.depositMet} {counts.depositMet} ·{" "}
        {inscriptionStatusLabels.paidInFull} {counts.paidInFull} · sin precio{" "}
        {inscriptions.filter((row) => row.status === null).length}
      </p>
      <ul className="flex flex-col gap-1 text-xs text-muted-foreground tabular-nums">
        {payments.map((payment) => (
          <li key={payment.id}>
            Pago #{payment.number}: {formatAmount(payment.allocatedAmount)}{" "}
            asignado, {formatAmount(payment.availableAmount)} disponible
          </li>
        ))}
      </ul>
    </section>
  );
}

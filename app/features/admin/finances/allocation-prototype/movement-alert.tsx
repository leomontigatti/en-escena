/**
 * THROWAWAY PROTOTYPE — ticket #585 of map #547.
 *
 * **What is left of the `Descuentos` section**, which was removed: the roster's
 * tooltip already answers *how much* — base price minus the percentage — and the
 * section's second half, the provenance, went with it.
 *
 * This did not, because it is not an explanation: it is a **pending action**. The
 * discount is always live, so an invoiced choreography's total moves when a
 * sibling registers or withdraws elsewhere, and under ADR-0009 nothing records
 * that it moved. The only comparison the model can honestly make is **what the
 * factura says against what is derived now** (#599), and when the two differ a
 * document is owed. It sits with the anomaly alerts, above the figures, because
 * that is what it is — something somebody has to do, not a way the screen is.
 */
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { formatAmount } from "../formatters";
import type { ChoreographyReading } from "./rollup";

export function MovementAlert({
  choreography,
}: {
  choreography: ChoreographyReading;
}) {
  if (choreography.comprobante === null || choreography.delta === 0) {
    return null;
  }

  // Which dancers' discounts moved: the alert names the cause, because the
  // roster below shows the new amounts without saying they changed.
  const moved = choreography.inscriptions.filter(
    (row) =>
      row.documentedAmount !== null && row.documentedAmount !== row.totalAmount,
  );
  const isDebit = choreography.delta > 0;

  return (
    <Alert variant={isDebit ? "default" : "destructive"}>
      <AlertTitle>
        {isDebit
          ? "Falta emitir una nota de débito"
          : "Falta emitir una nota de crédito"}
      </AlertTitle>
      <AlertDescription>
        <span>
          {choreography.comprobante.label} facturó{" "}
          {formatAmount(choreography.documentedTotal ?? 0)} y hoy corresponden{" "}
          {formatAmount(choreography.totalAmount)}:{" "}
          {formatAmount(Math.abs(choreography.delta))} de diferencia
          {moved.length > 0
            ? ` por el descuento de ${moved.map((row) => row.dancerName).join(", ")}.`
            : " por un cambio en el elenco."}{" "}
          Se emite desde el menú de acciones.
        </span>
      </AlertDescription>
    </Alert>
  );
}

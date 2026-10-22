import { CircleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  CREDIT_NOTE_DEADLINE_DAYS,
  type AnchorBilling,
} from "@/lib/comprobantes/anchor-billing";
import { formatAmount } from "@/lib/finances/formatters";

/**
 * The financial detail's reading of the unit's billing anomaly (ADR-0014 §5):
 * the note its documents owe, the two sides of the delta and, on a credit
 * owed for a withdrawal, the 15-day clock (#657). It sits with the other
 * anomaly alerts because it is something somebody has to do; the note is
 * emitted from the header's actions menu, the one place emission lives.
 *
 * Shared by both anchors, like the emission dialog. Self-resolving: emitting
 * the note brings the delta to zero and the alert goes with it.
 */
export function PendingDocumentAlert({ billing }: { billing: AnchorBilling }) {
  if (!billing.anomaly) {
    return null;
  }

  const note =
    billing.anomaly === "pendingDebitNote"
      ? "nota de débito"
      : "nota de crédito";

  return (
    <Alert variant="destructive">
      <CircleAlert aria-hidden="true" />
      <AlertTitle>Falta emitir una {note}</AlertTitle>
      <AlertDescription>
        Lo facturado suma {formatAmount(billing.documentedAmount)} y hoy
        corresponden {formatAmount(billing.owedAmount)}: la {note} es por{" "}
        {formatAmount(billing.amount)}.
        {billing.creditClockDays !== null
          ? ` Pasaron ${billing.creditClockDays} de los ${CREDIT_NOTE_DEADLINE_DAYS} días corridos desde la baja más antigua.`
          : null}{" "}
        Se emite desde el menú de acciones.
      </AlertDescription>
    </Alert>
  );
}

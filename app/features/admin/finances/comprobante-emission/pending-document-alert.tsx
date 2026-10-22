import { CircleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  CREDIT_NOTE_DEADLINE_DAYS,
  type AnchorBilling,
} from "@/lib/comprobantes/anchor-billing";
import { formatAmount, formatDancerName } from "@/lib/finances/formatters";

const nameList = new Intl.ListFormat("es", { type: "conjunction" });

/**
 * The financial detail's reading of the unit's billing anomaly (ADR-0014 §5):
 * the note its documents owe, the two sides of the delta, the rows no document
 * names yet and, on a credit owed for a withdrawal, the 15-day clock (#657).
 * The note is emitted from the header's actions menu.
 *
 * Shared by both anchors, like the emission dialog. Self-resolving: emitting
 * the note brings the delta to zero and the alert goes with it.
 */
export function PendingDocumentAlert({
  billing,
  inscriptions,
}: {
  billing: AnchorBilling;
  inscriptions: ReadonlyArray<{
    firstName: string;
    inscriptionId: string | null;
    lastName: string;
  }>;
}) {
  if (!billing.anomaly) {
    return null;
  }

  const note =
    billing.anomaly === "pendingDebitNote"
      ? "nota de débito"
      : "nota de crédito";
  const uninvoiced = inscriptions
    .filter(
      (inscription) =>
        inscription.inscriptionId !== null &&
        billing.uninvoicedInscriptionIds.includes(inscription.inscriptionId),
    )
    .map(formatDancerName);

  return (
    <Alert variant="destructive">
      <CircleAlert aria-hidden="true" />
      <AlertTitle>Falta emitir una {note}</AlertTitle>
      <AlertDescription>
        Lo facturado suma {formatAmount(billing.documentedAmount)} y hoy
        corresponden {formatAmount(billing.owedAmount)}: la {note} es por{" "}
        {formatAmount(billing.amount)}.
        {uninvoiced.length > 0
          ? ` Incluye a ${nameList.format(uninvoiced)}, que todavía no figura${uninvoiced.length > 1 ? "n" : ""} en ningún comprobante.`
          : null}
        {/* The clock runs only on a withdrawal's credit, which is when what is
            owed can read below what the cards say the unit holds. */}
        {billing.creditClockDays !== null
          ? ` De una baja solo se factura la seña que retiene. Pasaron ${billing.creditClockDays} de los ${CREDIT_NOTE_DEADLINE_DAYS} días corridos desde la baja más antigua.`
          : null}{" "}
        Se emite desde el menú de acciones.
      </AlertDescription>
    </Alert>
  );
}

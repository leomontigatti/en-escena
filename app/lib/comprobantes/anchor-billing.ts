import type { AnchorBillingAnomaly } from "@/lib/finances/inscription-financial-status";
import { getBusinessDateOnly } from "@/lib/shared/business-time-zone";

import {
  deriveAnchorDelta,
  type DocumentedComprobante,
  type OwedInscription,
} from "./emission-plan";

// What an invoiced unit's documents leave pending (ADR-0014 §5, #657): the
// delta the emitter bills, read as an anomaly by the finance surfaces. It is
// the same subtraction, through the same function, so the badge and the next
// document cannot disagree about what is owed.
//
// Its sign names the anomaly the way it names the document: a positive delta
// is `Pendiente de facturar` (a debit note is owed), a negative one
// `Pendiente de acreditar` (a credit note is owed). Like every anomaly it is a
// comparison of current state, persisted nowhere: emitting the note clears it.

/** An inscription as the delta counts it, and when it left the roster. */
export type BilledInscription = OwedInscription & {
  withdrawnAt: Date | null;
};

export type AnchorBilling = {
  anomaly: AnchorBillingAnomaly | null;
  // What the next note carries: the delta without its sign, zero when none.
  amount: number;
  // `FC + ΣND − ΣNC`, and what the unit owes today.
  documentedAmount: number;
  owedAmount: number;
  // The 15-day clock (RG 4540 art. 3): days since the oldest withdrawal whose
  // credit is still owed. Only on a pending credit, and only when a withdrawal
  // drives it: a delta from any other cause has no date the system persists
  // (ADR-0009), so it carries none rather than a made-up one.
  creditClockDays: number | null;
  // The rows the invoiced unit has not documented yet (`Sin facturar`): the
  // `Facturada` axis renders by its absence, since one invoice covers the
  // whole roster.
  uninvoicedInscriptionIds: string[];
};

/**
 * The unit's billing reading, or `null` while it holds no invoice: before it
 * there is nothing to adjust, and what blocks the invoice is the emission
 * menu's to say.
 *
 * `today` is the business date, `AAAA-MM-DD`.
 */
export function deriveAnchorBilling(input: {
  inscriptions: readonly BilledInscription[];
  comprobantes: readonly DocumentedComprobante[];
  today: string;
}): AnchorBilling | null {
  const anchorDelta = deriveAnchorDelta(input);

  if (!anchorDelta) {
    return null;
  }

  const { delta, documentedByInscription } = anchorDelta;
  const anomaly =
    delta === null || delta === 0
      ? null
      : delta > 0
        ? "pendingDebitNote"
        : "pendingCreditNote";

  return {
    anomaly,
    amount: delta === null ? 0 : Math.abs(delta),
    documentedAmount: anchorDelta.documented,
    owedAmount: anchorDelta.owed,
    creditClockDays:
      anomaly === "pendingCreditNote"
        ? deriveCreditClockDays(
            input.inscriptions,
            documentedByInscription,
            input.today,
          )
        : null,
    // Only rows a next note will name: one that owes nothing gets no line, and
    // while the delta is zero no note is emitted at all — a row added that
    // nets exactly against a withdrawal would read `Sin facturar` forever. An
    // unpriced row is kept, since its note follows once it has a price.
    uninvoicedInscriptionIds:
      delta === 0
        ? []
        : input.inscriptions
            .filter(
              (inscription) =>
                !documentedByInscription.has(inscription.id) &&
                inscription.owed !== 0,
            )
            .map((inscription) => inscription.id),
  };
}

// A withdrawal is unresolved while its row is documented above what it
// retains: the credit note for it has not gone out yet.
function deriveCreditClockDays(
  inscriptions: readonly BilledInscription[],
  documentedByInscription: ReadonlyMap<string, number>,
  today: string,
): number | null {
  let oldest: Date | null = null;

  for (const inscription of inscriptions) {
    if (
      inscription.withdrawnAt !== null &&
      (inscription.owed ?? 0) <
        (documentedByInscription.get(inscription.id) ?? 0) &&
      (oldest === null || inscription.withdrawnAt < oldest)
    ) {
      oldest = inscription.withdrawnAt;
    }
  }

  return oldest === null
    ? null
    : daysBetween(getBusinessDateOnly(oldest), today);
}

// Calendar days, `días corridos`: the withdrawal's own date is day zero.
function daysBetween(from: string, to: string): number {
  return Math.round((toUtcDay(to) - toUtcDay(from)) / 86_400_000);
}

function toUtcDay(dateOnly: string): number {
  const [year, month, day] = dateOnly.split("-").map(Number);

  return Date.UTC(year, month - 1, day);
}

/** The clock as the surfaces read it, `Día N de 15`. */
export function formatCreditClock(days: number): string {
  return `Día ${days} de ${CREDIT_NOTE_DEADLINE_DAYS}`;
}

// RG 4540 art. 3: the note is due within fifteen calendar days of the event.
export const CREDIT_NOTE_DEADLINE_DAYS = 15;

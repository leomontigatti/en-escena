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
// is `ND pendiente` (a debit note is owed), a negative one `NC pendiente` (a
// credit note is owed). Like every anomaly it is a comparison of current
// state, persisted nowhere: emitting the note clears it. It is the billing
// axis, beside the payment one and never in its place: a unit can be `Pagada`
// and still owe a note.

/** The note an invoiced unit's documents owe, named by the delta's sign. */
export type AnchorBillingAnomaly = "pendingDebitNote" | "pendingCreditNote";

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
  // The rows the invoiced unit has not documented yet: the next note names
  // them, so they read the note the unit owes.
  uninvoicedInscriptionIds: string[];
  // The rows some document of the unit names (`Facturada`).
  documentedInscriptionIds: string[];
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
    documentedInscriptionIds: [...documentedByInscription.keys()],
    // Only rows a next note will name: one that owes nothing gets no line, and
    // while the delta is zero no note is emitted at all — a row added that
    // nets exactly against a withdrawal would wait for a note forever. An
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

/**
 * An invoiced unit's comprobante status, and its inscriptions', the second
 * badge of their `Estado`
 * beside the payment one: its documents add up (`Facturada`), or the note they
 * owe. `null` before its invoice: the badge appears once something has been
 * issued. An unpriced unit's delta is unknown and reads `Facturada`: nothing
 * can be emitted for it until it has a price.
 */
export type BillingStatus = "invoiced" | AnchorBillingAnomaly;

export function deriveUnitBillingStatus(
  billing: AnchorBilling | null | undefined,
): BillingStatus | null {
  if (!billing) {
    return null;
  }

  return billing.anomaly ?? "invoiced";
}

/**
 * An inscription's comprobante status, on an invoiced unit only: some document
 * names it (`Facturada`), or the unit's next note will — the row reads the
 * note it is waiting for, as its unit does. `null` when neither holds: the
 * unit is not invoiced yet, the row owes nothing and no document will ever
 * name it, or the unit is unpriced and no note can be emitted until it is.
 */
export function deriveInscriptionBillingStatus(
  billing: AnchorBilling | null,
  inscriptionId: string | null,
): BillingStatus | null {
  if (!billing || inscriptionId === null) {
    return null;
  }

  if (billing.documentedInscriptionIds.includes(inscriptionId)) {
    return "invoiced";
  }

  return billing.uninvoicedInscriptionIds.includes(inscriptionId)
    ? billing.anomaly
    : null;
}

// RG 4540 art. 3: the note is due within fifteen calendar days of the event.
export const CREDIT_NOTE_DEADLINE_DAYS = 15;

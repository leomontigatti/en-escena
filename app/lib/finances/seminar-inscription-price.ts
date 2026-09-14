import {
  calculateDepositAmount,
  calculateTotalAmount,
  type InscriptionThresholds,
} from "@/lib/finances/inscription-financial-status";
import {
  deriveEffectivePrice,
  type PriceCandidate,
  selectApplicablePriceCandidate,
} from "@/lib/finances/inscription-price";
import type { SeminarKind } from "@/lib/seminars/seminar-kinds";
import { getBusinessDateOnly } from "@/lib/shared/business-time-zone";

/**
 * A `seminarPrice` row as the seminar's two-axis choice sees it: a candidate
 * plus the cell it prices. The rows are event-level and carry no `seminarId`,
 * so the seminar contributes only its `kind` and the person only their
 * participant cell.
 */
export type SeminarPriceCandidateRow = PriceCandidate & {
  forParticipants: boolean;
  kind: SeminarKind;
};

/**
 * The rows that may price one inscription: the person's participant cell, of
 * the seminar's kind, **falling back to the `regular` rows when that kind has
 * none** — exactly as a schedule-specific choreography price falls back to the
 * general row, which is why an event may leave `Exclusivo` empty.
 *
 * There is **no fallback on the participant axis**. A participant is priced by
 * `forParticipants = true` rows only, and a cell with no deadline-less
 * `regular` row leaves every seminar of the event unpriced — which is what
 * closes registration rather than quietly charging the other cell's amount.
 */
export function selectSeminarPriceCandidates<
  T extends SeminarPriceCandidateRow,
>(input: {
  forParticipants: boolean;
  priceRows: readonly T[];
  seminarKind: SeminarKind;
}): T[] {
  const ofCell = input.priceRows.filter(
    (row) => row.forParticipants === input.forParticipants,
  );
  const ofKind = ofCell.filter((row) => row.kind === input.seminarKind);

  return ofKind.length > 0
    ? ofKind
    : ofCell.filter((row) => row.kind === "regular");
}

/**
 * The row a seminar inscription is charged at: `crossed ? stored : (current ?? stored)`,
 * through the same owner as the choreography rule (`deriveEffectivePrice`), fed
 * the candidate set above and the **seminar's own** deposit percentage.
 *
 * The stored row is looked up over **every** row of the event and not over the
 * candidates: once the deposit is covered the stored row freezes both the tier
 * and the participant fact, so a person who later joins or leaves a
 * choreography keeps the row they were charged at even though it no longer
 * belongs to their cell.
 */
export function resolveEffectiveSeminarPriceRow<
  T extends SeminarPriceCandidateRow,
>(input: {
  allocatedAmount: number;
  forParticipants: boolean;
  priceRows: readonly T[];
  requiredDepositPercentage: number;
  seminarKind: SeminarKind;
  selectedPriceId: string | null;
}): T | null {
  const stored =
    input.selectedPriceId === null
      ? null
      : (input.priceRows.find((row) => row.id === input.selectedPriceId) ??
        null);
  const current = selectApplicablePriceCandidate(
    selectSeminarPriceCandidates(input),
    getBusinessDateOnly(),
  );

  return deriveEffectivePrice({
    allocatedAmount: input.allocatedAmount,
    current,
    requiredDepositPercentage: input.requiredDepositPercentage,
    stored,
  });
}

/**
 * A seminar inscription's two thresholds from its effective amount: the deposit
 * at the seminar's own rate, and the total as the amount itself. There is **no
 * `Descuento por bailarín`** in either direction — the participant row already
 * is the reduction for "also dancing" — which is why the formula owners are
 * called with a zero discount rather than replaced.
 *
 * No amount means no threshold: an inscription nothing prices reads `Sin precio`
 * and owes nothing computable, the same reading the choreography side takes.
 */
export function deriveSeminarInscriptionThresholds(input: {
  priceAmount: number | null;
  requiredDepositPercentage: number;
}): InscriptionThresholds {
  if (input.priceAmount === null) {
    return { depositAmount: null, totalAmount: null };
  }

  return {
    depositAmount: calculateDepositAmount({
      priceAmount: input.priceAmount,
      requiredDepositPercentage: input.requiredDepositPercentage,
    }),
    totalAmount: calculateTotalAmount({
      dancerDiscountAmount: 0,
      priceAmount: input.priceAmount,
    }),
  };
}

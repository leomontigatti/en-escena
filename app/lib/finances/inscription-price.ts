import {
  type ChoreographyScheduleSources,
  resolveChoreographyPricingScheduleId,
} from "@/lib/finances/choreography-pricing-schedule";
import {
  calculateDepositAmount,
  hasCrossedDepositThreshold,
} from "@/lib/finances/inscription-financial-status";
import { getBusinessDateOnly } from "@/lib/shared/business-time-zone";

/**
 * What the price rules need of a row to choose among rows and to fix one: an
 * identity, an amount and a deadline. A choreography's `price` row has more —
 * group type, schedule — and a seminar's tier has a different amount per
 * participant kind, but by the time either reaches these functions it is one of
 * these.
 */
export type PriceCandidate = {
  id: string;
  amount: number;
  paymentDeadline: string | null;
};

/**
 * The key an inscription's price is looked up by: the choreography's group type
 * and its pricing schedule, read off the same two sources
 * `resolveChoreographyPricingScheduleId` reads.
 */
export type InscriptionPriceKey = ChoreographyScheduleSources & {
  groupType: string;
};

/**
 * A choreography `price` row as the two-tier choice sees it: a candidate plus
 * the two axes the key is matched against.
 */
export type InscriptionPriceRow = PriceCandidate & {
  groupType: string;
  scheduleId: string | null;
};

/**
 * The one candidate that applies on `businessDate`: rows whose deadline has
 * passed are out, and among the survivors the nearest deadline wins, then the
 * lowest amount. A row with no deadline survives every date and sorts last, so
 * it is the one that applies once every dated row of its tier has expired.
 *
 * There is no dateless overload. Every caller resolves against today's business
 * date, which is what keeps two surfaces from quoting two prices for one
 * inscription.
 */
export function selectApplicablePriceCandidate<T extends PriceCandidate>(
  candidates: readonly T[],
  businessDate: string,
): T | null {
  return (
    candidates
      .filter(
        (candidate) =>
          candidate.paymentDeadline === null ||
          candidate.paymentDeadline >= businessDate,
      )
      .sort(compareApplicableCandidates)[0] ?? null
  );
}

function compareApplicableCandidates(
  first: PriceCandidate,
  second: PriceCandidate,
) {
  if (first.paymentDeadline === null && second.paymentDeadline !== null) {
    return 1;
  }

  if (first.paymentDeadline !== null && second.paymentDeadline === null) {
    return -1;
  }

  if (first.paymentDeadline && second.paymentDeadline) {
    const deadlineComparison = first.paymentDeadline.localeCompare(
      second.paymentDeadline,
    );

    if (deadlineComparison !== 0) {
      return deadlineComparison;
    }
  }

  return first.amount - second.amount;
}

/**
 * The price row that applies to a choreography inscription on `businessDate`:
 * the row specific to its pricing schedule and group type when one applies, and
 * the general row for that group type otherwise. `null` when neither is on
 * offer.
 *
 * This is the single owner of the two-tier choice. It composes
 * `resolveChoreographyPricingScheduleId` and `selectApplicablePriceCandidate`
 * rather than restating either, so a new price dimension or a new tie-break is
 * one edit.
 */
export function selectApplicableInscriptionPrice<
  T extends InscriptionPriceRow,
>(input: {
  businessDate: string;
  key: InscriptionPriceKey;
  priceRows: readonly T[];
}): T | null {
  const scheduleId = resolveChoreographyPricingScheduleId(input.key);
  const ofGroupType = input.priceRows.filter(
    (price) => price.groupType === input.key.groupType,
  );

  if (scheduleId !== null) {
    const schedulePrice = selectApplicablePriceCandidate(
      ofGroupType.filter((price) => price.scheduleId === scheduleId),
      input.businessDate,
    );

    if (schedulePrice) {
      return schedulePrice;
    }
  }

  return selectApplicablePriceCandidate(
    ofGroupType.filter((price) => price.scheduleId === null),
    input.businessDate,
  );
}

/**
 * The candidate an inscription is charged at: `crossed ? stored : (current ?? stored)`.
 *
 * **The price stops moving when the inscription crosses its deposit threshold**,
 * which is what a deposit buys. Below that threshold the stored candidate is not
 * authoritative: the read re-derives from the one that applies today, so a page
 * refresh moves the figures and so does the passage of time. That is deliberate
 * — locking at the first allocated peso would let an academy freeze the whole
 * price list for one peso per inscription ahead of a price rollover.
 *
 * `crossed` is tested against the **stored** candidate and never against the
 * current one; `hasCrossedDepositThreshold` says why. That clause is what keeps
 * the rule from being circular, whichever path derives it.
 *
 * The `?? stored` fallback carries the case where no candidate applies at all —
 * every deadline has passed, or none was ever configured — and it is why the
 * stored candidate is still worth writing below the threshold.
 *
 * It knows nothing about where the candidates came from: the choreography path
 * feeds it price rows selected by group type and schedule, and a seminar path
 * feeds it tiers already reduced to the amount that applies to the person.
 */
export function deriveEffectivePrice<T extends PriceCandidate>(input: {
  allocatedAmount: number;
  current: T | null;
  requiredDepositPercentage: number;
  stored: T | null;
}): T | null {
  if (
    input.stored !== null &&
    hasCrossedDepositThreshold({
      allocatedAmount: input.allocatedAmount,
      depositAmount: calculateDepositAmount({
        priceAmount: input.stored.amount,
        requiredDepositPercentage: input.requiredDepositPercentage,
      }),
    })
  ) {
    return input.stored;
  }

  return input.current ?? input.stored;
}

export type EffectiveBasePriceInput<T extends InscriptionPriceRow> = {
  allocatedAmount: number;
  // `undefined` when the reader could not pair the inscription with its
  // choreography; nothing applies today then, and the stored row is all there is.
  choreography: InscriptionPriceKey | undefined;
  priceRows: readonly T[];
  requiredDepositPercentage: number;
  selectedPriceId: string | null;
};

/**
 * `deriveEffectivePrice` for a choreography inscription, over the event's price
 * rows: the stored row is the one `selectedPriceId` names, and the current one
 * is `selectApplicableInscriptionPrice` against today's business date.
 *
 * Every surface that shows a choreography price goes through it — the readers,
 * the write path's thresholds, the allocation dialog's readout and the
 * price-divergence guard — so no two of them can name different prices for the
 * same inscription.
 */
export function resolveEffectiveBasePriceRow<T extends InscriptionPriceRow>(
  input: EffectiveBasePriceInput<T>,
): T | null {
  const stored =
    input.selectedPriceId === null
      ? null
      : (input.priceRows.find((price) => price.id === input.selectedPriceId) ??
        null);
  const current = input.choreography
    ? selectApplicableInscriptionPrice({
        businessDate: getBusinessDateOnly(),
        key: input.choreography,
        priceRows: input.priceRows,
      })
    : null;

  return deriveEffectivePrice({
    allocatedAmount: input.allocatedAmount,
    current,
    requiredDepositPercentage: input.requiredDepositPercentage,
    stored,
  });
}

/** `resolveEffectiveBasePriceRow` for the callers that only need the figure. */
export function resolveEffectiveBasePriceAmount<T extends InscriptionPriceRow>(
  input: EffectiveBasePriceInput<T>,
): number | null {
  return resolveEffectiveBasePriceRow(input)?.amount ?? null;
}

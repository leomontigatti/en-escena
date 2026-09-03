import { prices } from "@/db/schema";
import { resolveChoreographyPricingScheduleId } from "@/lib/finances/choreography-pricing-schedule";
import {
  calculateDepositAmount,
  type ChoreographyFinancialStatus,
  deriveChoreographyFinancialStatus,
  hasCrossedDepositThreshold,
  type InscriptionAnomaly,
  type InscriptionFinancialStatus,
} from "@/lib/finances/inscription-financial-status";
import {
  completeOperationalFinanceAmount,
  incompleteOperationalFinanceAmount,
  type OperationalFinanceAmount,
  type OperationalFinanceSummary,
} from "@/lib/finances/operational-summary";
import { selectApplicablePriceFromCandidates } from "@/lib/prices/repository.server";
import { getBusinessDateOnly } from "@/lib/shared/business-time-zone";

export type FinancePriceRow = typeof prices.$inferSelect;
type FinanceAmountResolution =
  | {
      amount: number;
      status: "complete";
    }
  | {
      status: "missing-price";
    };

export type ChoreographyGroupType = "solo" | "duo" | "trio" | "grupal";

/**
 * An inscription with its figures already derived by the reader. None of them is
 * a snapshot: they all come from the selected price, the live
 * `Descuento por bailarín` and what the inscription has allocated right now.
 */
export type ResolvedInscription = {
  id: string;
  choreographyId: string;
  dancerId: string;
  financialStatus: InscriptionFinancialStatus;
  anomalies: InscriptionAnomaly[];
  // Total allocated to this inscription (`Σ asignaciones`).
  allocatedAmount: number;
  // Selected price, **before** any discount. `null` only if no price applies.
  basePriceAmount: number | null;
  // `Descuento por bailarín`, always live.
  dancerDiscountAmount: number;
  // `price − discount`, the high threshold. Applies the discount exactly once.
  totalAmount: number | null;
  // `price × percentage`, the low threshold, computed on the undiscounted price.
  depositAmount: number | null;
  owedBalanceAmount: number | null;
  owedDepositAmount: number | null;
  overAllocatedAmount: number | null;
  // Roster withdrawal, not a money status. It decides which rollup the row
  // enters and which badge it carries; its figures already come derived
  // accordingly.
  withdrawn: boolean;
};

export type FinanceChoreographyRow = {
  academyId: string;
  groupType: ChoreographyGroupType;
  id: string;
  name: string;
  choreographyScheduleId: string | null;
  scheduleCapacityScheduleId: string | null;
};

/**
 * The same figures as an inscription, summed over its own. The state is not
 * summed: it is the minimum (see `deriveChoreographyFinancialStatus`).
 *
 * The two rollups part ways on withdrawn rows: a withdrawn inscription enters
 * the money one —its total is what was retained, and that money belongs to this
 * choreography— and stays out of the status one, because the choreography's
 * badge answers *can this be performed as choreographed?* and a withdrawn row is
 * no longer part of that answer.
 */
export type ChoreographyOperationalFinanceRow = {
  allocatedAmount: number;
  anomalies: InscriptionAnomaly[];
  basePriceAmount: OperationalFinanceAmount;
  depositAmount: OperationalFinanceAmount;
  totalAmount: OperationalFinanceAmount;
  financialStatus: ChoreographyFinancialStatus;
  groupType: ChoreographyGroupType;
  id: string;
  name: string;
  overAllocatedAmount: number;
  // Collectable debt. A registered choreography is owed in full: every
  // inscription owes the shortfall against each of its two thresholds. They are
  // not disjoint — they are two cuts of the same debt, and `Seña ≤ Saldo` always.
  owedBalanceAmount: OperationalFinanceAmount;
  owedDepositAmount: OperationalFinanceAmount;
  registrationCount: number;
};

/**
 * `Descuento por bailarín` percentage, by how many active inscriptions the same
 * dancer has in the same event and academy.
 */
export function dancerDiscountPercentage(qualifyingCount: number): number {
  if (qualifyingCount >= 4) {
    return 15;
  }

  if (qualifyingCount === 3) {
    return 10;
  }

  return 0;
}

export type DancerDiscount = {
  amount: number;
  percentage: number;
};

/**
 * `Descuento por bailarín` per inscription. The qualifying set is the dancer's
 * live roster, not their money: the discount goes into the total, and the total
 * decides the state, so making it depend on the state would be circular. One
 * inscription is left without a discount: the first when ordered by price and
 * (as a tie-break) by id.
 */
export function computeDancerDiscountAmounts(
  qualifyingInscriptions: Array<{
    id: string;
    priceAmount: number;
  }>,
): Map<string, DancerDiscount> {
  const discounts = new Map<string, DancerDiscount>();
  const percentage = dancerDiscountPercentage(qualifyingInscriptions.length);

  if (percentage === 0) {
    for (const inscription of qualifyingInscriptions) {
      discounts.set(inscription.id, { amount: 0, percentage: 0 });
    }

    return discounts;
  }

  const ordered = [...qualifyingInscriptions].sort(
    (a, b) => b.priceAmount - a.priceAmount || a.id.localeCompare(b.id),
  );

  ordered.forEach((inscription, index) => {
    if (index === 0) {
      discounts.set(inscription.id, { amount: 0, percentage: 0 });
      return;
    }

    discounts.set(inscription.id, {
      amount: Math.round((inscription.priceAmount * percentage) / 100),
      percentage,
    });
  });

  return discounts;
}

export function buildChoreographyOperationalFinanceRow(input: {
  choreography: FinanceChoreographyRow;
  inscriptions: ResolvedInscription[];
}): ChoreographyOperationalFinanceRow {
  let allocatedAmount = 0;
  let overAllocatedAmount = 0;
  const basePriceAmount = createAmountAccumulator();
  const depositAmount = createAmountAccumulator();
  const totalAmount = createAmountAccumulator();
  const owedBalanceAmount = createAmountAccumulator();
  const owedDepositAmount = createAmountAccumulator();

  for (const inscription of input.inscriptions) {
    allocatedAmount += inscription.allocatedAmount;
    overAllocatedAmount += inscription.overAllocatedAmount ?? 0;

    basePriceAmount.add(inscription.basePriceAmount);
    depositAmount.add(inscription.depositAmount);
    totalAmount.add(inscription.totalAmount);
    owedBalanceAmount.add(inscription.owedBalanceAmount);
    owedDepositAmount.add(inscription.owedDepositAmount);
  }

  return {
    allocatedAmount,
    anomalies: overAllocatedAmount > 0 ? ["overAllocated"] : [],
    basePriceAmount: basePriceAmount.build(),
    depositAmount: depositAmount.build(),
    financialStatus: deriveChoreographyFinancialStatus(
      input.inscriptions
        .filter((inscription) => !inscription.withdrawn)
        .map((inscription) => inscription.financialStatus),
    ),
    groupType: input.choreography.groupType,
    id: input.choreography.id,
    name: input.choreography.name,
    overAllocatedAmount,
    owedBalanceAmount: owedBalanceAmount.build(),
    owedDepositAmount: owedDepositAmount.build(),
    registrationCount: input.inscriptions.filter(
      (inscription) => !inscription.withdrawn,
    ).length,
    totalAmount: totalAmount.build(),
  };
}

/**
 * An academy's `Seña adeudada` and `Saldo adeudado`. Both are gross: they do not
 * subtract `Saldo disponible`, which is shown alongside as a metric of its own.
 */
export function buildOperationalFinanceSummaryFromChoreographyRows(input: {
  availableBalanceAmount: number;
  choreographyFinanceRows: ChoreographyOperationalFinanceRow[];
  totalPaidAmount: number;
}): OperationalFinanceSummary {
  const owedDepositAmount = sumOperationalFinanceAmounts(
    input.choreographyFinanceRows.map((row) => row.owedDepositAmount),
  );
  const owedBalanceAmount = sumOperationalFinanceAmounts(
    input.choreographyFinanceRows.map((row) => row.owedBalanceAmount),
  );

  return {
    availableBalanceAmount: input.availableBalanceAmount,
    owedBalanceAmount: buildOperationalFinanceAmount(owedBalanceAmount),
    owedDepositAmount: buildOperationalFinanceAmount(owedDepositAmount),
    totalPaidAmount: input.totalPaidAmount,
  };
}

type EffectiveBasePriceInput = {
  allocatedAmount: number;
  choreography:
    | Pick<
        FinanceChoreographyRow,
        "groupType" | "choreographyScheduleId" | "scheduleCapacityScheduleId"
      >
    | undefined;
  priceRows: FinancePriceRow[];
  requiredDepositPercentage: number;
  selectedPriceId: string | null;
};

/**
 * The price row an inscription is charged at: `crossed ? stored : (current ?? stored)`.
 *
 * **The price stops moving when the inscription crosses its deposit threshold**,
 * which is what a deposit buys. Below that threshold the stored row is not
 * authoritative: the read re-derives from the row that applies today, so a page
 * refresh moves the figures and so does the passage of time. That is deliberate
 * — locking at the first allocated peso would let an academy freeze the whole
 * price list for one peso per inscription ahead of a price rollover.
 *
 * `crossed` is tested against the **stored** row and never against the current
 * one; `hasCrossedDepositThreshold` says why.
 *
 * The `?? stored` fallback carries the case where no row applies at all — every
 * candidate's `paymentDeadline` has passed, or none was ever configured — and it
 * is why the stored row is still worth writing below the threshold.
 *
 * This is the single owner of the rule. Every surface that shows a price goes
 * through it — the two readers through `resolveEffectiveBasePriceAmount` and the
 * allocation dialog's readout through the row itself — so no two of them can
 * name different prices for the same inscription.
 */
export function resolveEffectiveBasePriceRow(
  input: EffectiveBasePriceInput,
): FinancePriceRow | null {
  const stored =
    input.selectedPriceId === null
      ? null
      : (input.priceRows.find((price) => price.id === input.selectedPriceId) ??
        null);

  if (
    stored !== null &&
    hasCrossedDepositThreshold({
      allocatedAmount: input.allocatedAmount,
      depositAmount: calculateDepositAmount({
        priceAmount: stored.amount,
        requiredDepositPercentage: input.requiredDepositPercentage,
      }),
    })
  ) {
    return stored;
  }

  if (!input.choreography) {
    return stored;
  }

  return (
    resolveApplicablePriceRow({
      choreography: input.choreography,
      priceRows: input.priceRows,
    }) ?? stored
  );
}

/** `resolveEffectiveBasePriceRow` for the callers that only need the figure. */
export function resolveEffectiveBasePriceAmount(
  input: EffectiveBasePriceInput,
): number | null {
  return resolveEffectiveBasePriceRow(input)?.amount ?? null;
}

/**
 * The amount of the row that applies today, against the Córdoba business date.
 * `missing-price` when no price row applies.
 *
 * It is asked about an inscription that stores no row **and** about one that
 * stores a row it has not yet paid the deposit of: below that threshold the stored
 * row is not authoritative, so this is the `current` half of
 * `resolveEffectiveBasePriceRow`.
 */
export function resolveEstimatedBasePriceAmount(input: {
  choreography: Pick<
    FinanceChoreographyRow,
    "groupType" | "choreographyScheduleId" | "scheduleCapacityScheduleId"
  >;
  priceRows: FinancePriceRow[];
}): FinanceAmountResolution {
  const applicable = resolveApplicablePriceRow(input);

  return applicable === null
    ? { status: "missing-price" }
    : { amount: applicable.amount, status: "complete" };
}

/**
 * The row that applies today: the one specific to the choreography's schedule
 * and group type first, then the general row for that group type. `null` when
 * neither is on offer.
 */
function resolveApplicablePriceRow(input: {
  choreography: Pick<
    FinanceChoreographyRow,
    "groupType" | "choreographyScheduleId" | "scheduleCapacityScheduleId"
  >;
  priceRows: FinancePriceRow[];
}): FinancePriceRow | null {
  const financialReferenceDate = getBusinessDateOnly();
  const scheduleId = resolveChoreographyPricingScheduleId(input.choreography);
  const schedulePrice = scheduleId
    ? selectApplicablePriceFromCandidates(
        input.priceRows.filter(
          (price) =>
            price.groupType === input.choreography.groupType &&
            price.scheduleId === scheduleId,
        ),
        financialReferenceDate,
      )
    : null;

  if (schedulePrice) {
    return schedulePrice;
  }

  return selectApplicablePriceFromCandidates(
    input.priceRows.filter(
      (price) =>
        price.groupType === input.choreography.groupType &&
        price.scheduleId === null,
    ),
    financialReferenceDate,
  );
}

/**
 * Accumulates a figure that may be missing because no price applies, counting
 * how many inscriptions left it incomplete.
 */
function createAmountAccumulator() {
  let amount = 0;
  let missingPriceCount = 0;

  return {
    add(value: number | null) {
      if (value === null) {
        missingPriceCount++;
        return;
      }

      amount += value;
    },
    build(): OperationalFinanceAmount {
      return buildOperationalFinanceAmount({ amount, missingPriceCount });
    },
  };
}

function buildOperationalFinanceAmount(input: {
  amount: number;
  missingPriceCount: number;
}): OperationalFinanceAmount {
  if (input.missingPriceCount > 0) {
    return incompleteOperationalFinanceAmount(input);
  }

  return completeOperationalFinanceAmount(input.amount);
}

function sumOperationalFinanceAmounts(amounts: OperationalFinanceAmount[]) {
  return amounts.reduce(
    (total, amount) => ({
      amount: total.amount + amount.amount,
      missingPriceCount:
        total.missingPriceCount +
        (amount.status === "incomplete" ? amount.missingPriceCount : 0),
    }),
    {
      amount: 0,
      missingPriceCount: 0,
    },
  );
}

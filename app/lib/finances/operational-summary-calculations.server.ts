import { prices } from "@/db/schema";
import {
  type ChoreographyFinancialStatus,
  deriveMinimumFinancialStatus,
  type InscriptionAnomaly,
  type InscriptionFinancialStatus,
} from "@/lib/finances/inscription-financial-status";
import {
  buildOperationalFinanceAmount,
  type OperationalFinanceAmount,
  type OperationalFinanceSummary,
  sumOperationalFinanceAmounts,
} from "@/lib/finances/operational-summary";

export type FinancePriceRow = typeof prices.$inferSelect;
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
  // The row that amount came from, so a surface offering to change the price can
  // name the one in force instead of only pricing it.
  basePriceId: string | null;
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
  choreographyNumber: number;
  groupType: ChoreographyGroupType;
  id: string;
  name: string;
  choreographyScheduleId: string | null;
  scheduleCapacityScheduleId: string | null;
};

/**
 * The same figures as an inscription, summed over the unit that holds them.
 * Shared by both kinds: what a choreography and a `(seminar, academy)` pair add
 * to it is what names them, never a figure.
 */
export type OperationalFinanceRollup = {
  allocatedAmount: number;
  anomalies: InscriptionAnomaly[];
  basePriceAmount: OperationalFinanceAmount;
  depositAmount: OperationalFinanceAmount;
  totalAmount: OperationalFinanceAmount;
  financialStatus: InscriptionFinancialStatus;
  overAllocatedAmount: number;
  // Collectable debt. A registered unit is owed in full: every inscription owes
  // the shortfall against each of its two thresholds. They are not disjoint —
  // they are two cuts of the same debt, and `Seña ≤ Saldo` always.
  owedBalanceAmount: OperationalFinanceAmount;
  owedDepositAmount: OperationalFinanceAmount;
  registrationCount: number;
};

/**
 * A choreography's rollup: the shared figures plus what names the choreography.
 */
export type ChoreographyOperationalFinanceRow = OperationalFinanceRollup & {
  // The event-scoped number the choreography is identified by. It carries no
  // money, but it travels with the row because it is how the administrator and
  // the academy name the choreography to each other.
  choreographyNumber: number;
  financialStatus: ChoreographyFinancialStatus;
  groupType: ChoreographyGroupType;
  id: string;
  name: string;
};

/**
 * What a rollup needs of an inscription. Both kinds derive their figures
 * through the same owner, so both answer this shape and the accumulation below
 * never learns which kind it is summing.
 */
export type RollupInscription = {
  allocatedAmount: number;
  basePriceAmount: number | null;
  depositAmount: number | null;
  financialStatus: InscriptionFinancialStatus;
  overAllocatedAmount: number | null;
  owedBalanceAmount: number | null;
  owedDepositAmount: number | null;
  totalAmount: number | null;
  withdrawn: boolean;
};

/**
 * The figures of a set of inscriptions summed into the unit that holds them —
 * a choreography or a `(seminar, academy)` pair. The state is not summed: it is
 * the minimum (see `deriveMinimumFinancialStatus`).
 *
 * The two rollups part ways on withdrawn rows: a withdrawn inscription enters
 * the money one —its total is what was retained, and that money belongs to this
 * unit— and stays out of the status one, because the unit's badge answers
 * *can this happen as registered?* and a withdrawn row is no longer part of that
 * answer. The same sentence holds for a seminar's place, which is why the count
 * beside the money is the active one.
 */
export function rollUpInscriptionFinanceFigures(
  inscriptions: readonly RollupInscription[],
): OperationalFinanceRollup {
  let allocatedAmount = 0;
  let overAllocatedAmount = 0;
  const basePriceAmount = createAmountAccumulator();
  const depositAmount = createAmountAccumulator();
  const totalAmount = createAmountAccumulator();
  const owedBalanceAmount = createAmountAccumulator();
  const owedDepositAmount = createAmountAccumulator();

  for (const inscription of inscriptions) {
    allocatedAmount += inscription.allocatedAmount;
    overAllocatedAmount += inscription.overAllocatedAmount ?? 0;

    basePriceAmount.add(inscription.basePriceAmount);
    depositAmount.add(inscription.depositAmount);
    totalAmount.add(inscription.totalAmount);
    owedBalanceAmount.add(inscription.owedBalanceAmount);
    owedDepositAmount.add(inscription.owedDepositAmount);
  }

  const activeInscriptions = inscriptions.filter(
    (inscription) => !inscription.withdrawn,
  );

  return {
    allocatedAmount,
    anomalies: overAllocatedAmount > 0 ? ["overAllocated"] : [],
    basePriceAmount: basePriceAmount.build(),
    depositAmount: depositAmount.build(),
    financialStatus: deriveMinimumFinancialStatus(
      activeInscriptions.map((inscription) => inscription.financialStatus),
    ),
    overAllocatedAmount,
    owedBalanceAmount: owedBalanceAmount.build(),
    owedDepositAmount: owedDepositAmount.build(),
    registrationCount: activeInscriptions.length,
    totalAmount: totalAmount.build(),
  };
}

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
  return {
    ...rollUpInscriptionFinanceFigures(input.inscriptions),
    choreographyNumber: input.choreography.choreographyNumber,
    groupType: input.choreography.groupType,
    id: input.choreography.id,
    name: input.choreography.name,
  };
}

/**
 * An academy's `Seña adeudada` and `Saldo adeudado`. Both are gross: they do not
 * subtract `Saldo disponible`, which is shown alongside as a metric of its own.
 *
 * The rows it takes are **of both kinds** — choreographies and
 * `(seminar, academy)` units alike — because an academy has one debt against
 * one pool. A surface may break a total down by kind; the read model does not
 * (docs/domain/finances.md, "The figures").
 */
export function buildOperationalFinanceSummaryFromRows(input: {
  availableBalanceAmount: number;
  financeRows: OperationalFinanceRollup[];
  totalPaidAmount: number;
}): OperationalFinanceSummary {
  const owedDepositAmount = sumOperationalFinanceAmounts(
    input.financeRows.map((row) => row.owedDepositAmount),
  );
  const owedBalanceAmount = sumOperationalFinanceAmounts(
    input.financeRows.map((row) => row.owedBalanceAmount),
  );
  const depositAmount = sumOperationalFinanceAmounts(
    input.financeRows.map((row) => row.depositAmount),
  );
  const totalAmount = sumOperationalFinanceAmounts(
    input.financeRows.map((row) => row.totalAmount),
  );

  return {
    availableBalanceAmount: input.availableBalanceAmount,
    depositAmount,
    totalAmount,
    owedBalanceAmount,
    owedDepositAmount,
    totalPaidAmount: input.totalPaidAmount,
  };
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

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

type FinancePriceRow = typeof prices.$inferSelect;
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
 * Una inscripción con sus cifras ya derivadas por el reader. Ninguna es un
 * snapshot: todas salen del precio seleccionado, del `Descuento por bailarín`
 * vivo y de lo que la inscripción tiene asignado en este momento.
 */
export type ResolvedInscription = {
  id: string;
  choreographyId: string;
  dancerId: string;
  financialStatus: InscriptionFinancialStatus;
  anomalies: InscriptionAnomaly[];
  // Total asignado a esta inscripción (`Σ asignaciones`).
  allocatedAmount: number;
  // Precio seleccionado, **sin** descontar. `null` sólo si no hay precio aplicable.
  basePriceAmount: number | null;
  // `Descuento por bailarín`, siempre vivo.
  dancerDiscountAmount: number;
  // `precio − descuento`, el umbral alto. Aplica el descuento una sola vez.
  totalAmount: number | null;
  // `precio × porcentaje`, el umbral bajo, computado sobre el precio sin descontar.
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
 * Las mismas cifras que una inscripción, sumadas sobre las suyas. El estado no
 * se suma: es el mínimo (ver `deriveChoreographyFinancialStatus`).
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
  // Deuda exigible. Una coreografía registrada se adeuda completa: toda
  // inscripción adeuda el faltante contra cada uno de sus dos umbrales. No son
  // disjuntas — son dos cortes de la misma deuda, y `Seña ≤ Saldo` siempre.
  owedBalanceAmount: OperationalFinanceAmount;
  owedDepositAmount: OperationalFinanceAmount;
  registrationCount: number;
};

/**
 * Porcentaje de `Descuento por bailarín` según cuántas inscripciones activas
 * tiene el mismo bailarín en el mismo evento y academia.
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
 * `Descuento por bailarín` por inscripción. El conjunto que califica es el
 * roster vivo del bailarín, no su dinero: el descuento entra en el total, y el
 * total decide el estado, así que hacerlo depender del estado sería circular.
 * Una inscripción queda sin descuento: la primera al ordenar por precio y
 * (desempate) por id.
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
 * `Seña adeudada` y `Saldo adeudado` de una academia. Ambas son brutas: no
 * descuentan `Saldo disponible`, que se muestra al lado como su propia métrica.
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

/**
 * The price an inscription is charged at: `crossed ? stored : (current ?? stored)`.
 *
 * **The price stops moving when the inscription crosses its deposit threshold**,
 * which is what a seña buys. Below that threshold the stored row is not
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
 * This is the single owner of the rule: both read paths call it, so they cannot
 * disagree.
 */
export function resolveEffectiveBasePriceAmount(input: {
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
}): number | null {
  const storedAmount =
    input.selectedPriceId === null
      ? null
      : (input.priceRows.find((price) => price.id === input.selectedPriceId)
          ?.amount ?? null);

  if (
    storedAmount !== null &&
    hasCrossedDepositThreshold({
      allocatedAmount: input.allocatedAmount,
      depositAmount: calculateDepositAmount({
        priceAmount: storedAmount,
        requiredDepositPercentage: input.requiredDepositPercentage,
      }),
    })
  ) {
    return storedAmount;
  }

  if (!input.choreography) {
    return storedAmount;
  }

  const current = resolveEstimatedBasePriceAmount({
    choreography: input.choreography,
    priceRows: input.priceRows,
  });

  return current.status === "missing-price" ? storedAmount : current.amount;
}

/**
 * Precio vigente para una inscripción sin precio seleccionado, contra la fecha
 * de negocio de Córdoba. `missing-price` cuando no hay fila de precio aplicable.
 */
export function resolveEstimatedBasePriceAmount(input: {
  choreography: Pick<
    FinanceChoreographyRow,
    "groupType" | "choreographyScheduleId" | "scheduleCapacityScheduleId"
  >;
  priceRows: FinancePriceRow[];
}): FinanceAmountResolution {
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
    return {
      amount: schedulePrice.amount,
      status: "complete",
    };
  }

  const generalPrice = selectApplicablePriceFromCandidates(
    input.priceRows.filter(
      (price) =>
        price.groupType === input.choreography.groupType &&
        price.scheduleId === null,
    ),
    financialReferenceDate,
  );

  if (!generalPrice) {
    return {
      status: "missing-price",
    };
  }

  return {
    amount: generalPrice.amount,
    status: "complete",
  };
}

/**
 * Acumula una cifra que puede faltar por no haber precio aplicable, contando
 * cuántas inscripciones la dejaron incompleta.
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

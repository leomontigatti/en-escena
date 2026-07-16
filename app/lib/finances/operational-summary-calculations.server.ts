import { prices } from "@/db/schema";
import {
  completeOperationalFinanceAmount,
  type ChoreographyFinancialState,
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

export type InscriptionFinancialState = ChoreographyFinancialState;

/**
 * Snapshot presence markers of an inscription (`choreography_dancer`). The
 * economic state is derived, never persisted: sin seña => `impaga`; con seña y
 * sin saldo => `señada`; con saldo => `pagada`.
 */
export type InscriptionSnapshot = {
  depositReferenceDate: string | null;
  balanceReferenceDate: string | null;
};

/**
 * A fully resolved inscription: prices are already resolved by the reader
 * (frozen for `señada`/`pagada`, precio tentativo vigente for `impaga`).
 */
export type ResolvedInscription = {
  id: string;
  choreographyId: string;
  dancerId: string;
  state: InscriptionFinancialState;
  // Precio base de la inscripción. `null` sólo para `impaga` sin precio vigente.
  basePriceAmount: number | null;
  // Seña de la inscripción. `null` sólo para `impaga` sin precio vigente.
  depositAmount: number | null;
  // Saldo pendiente estimado de una inscripción `señada` (0 para el resto).
  balancePendingAmount: number;
  // `Descuento por bailarín` (estimado para `señada`, congelado para `pagada`).
  dancerDiscountAmount: number;
  // Precio final de la inscripción. `null` sólo para `impaga` sin precio.
  finalPriceAmount: number | null;
  // Total asignado a esta inscripción (pagos↔inscripción).
  paidAmount: number;
  depositReferenceDate: string | null;
};

export type FinanceChoreographyRow = {
  academyId: string;
  groupType: ChoreographyGroupType;
  id: string;
  name: string;
  choreographyScheduleId: string | null;
  scheduleCapacityScheduleId: string | null;
};

export type ChoreographyOperationalFinanceRow = {
  basePriceAmount: OperationalFinanceAmount;
  depositAmount: OperationalFinanceAmount;
  depositCompletedOn: string | null;
  financialState: ChoreographyFinancialState;
  needsAttention: boolean;
  groupType: ChoreographyGroupType;
  id: string;
  name: string;
  owedAmount: OperationalFinanceAmount;
  owedDepositAmount: OperationalFinanceAmount;
  paidAmount: number;
  registrationCount: number;
};

/**
 * Deriva el estado económico de una inscripción por presencia de snapshots.
 */
export function deriveInscriptionFinancialState(
  snapshot: InscriptionSnapshot,
): InscriptionFinancialState {
  if (snapshot.balanceReferenceDate !== null) {
    return "pagada";
  }

  if (snapshot.depositReferenceDate !== null) {
    return "señada";
  }

  return "impaga";
}

/**
 * Marca de agua del estado financiero de una coreografía a partir de sus
 * inscripciones activas. No es un mínimo: una coreografía `señada` no vuelve a
 * `impaga` por sumar una inscripción `impaga`.
 */
export function deriveChoreographyFinancialState(
  states: InscriptionFinancialState[],
): ChoreographyFinancialState {
  if (states.length === 0) {
    return "impaga";
  }

  if (states.every((state) => state === "pagada")) {
    return "pagada";
  }

  if (states.some((state) => state === "pagada" || state === "señada")) {
    return "señada";
  }

  return "impaga";
}

/**
 * Display "necesita atención": las inscripciones activas están mezcladas y el
 * flujo normal no puede resolverlas en una sola acción. Derivado, no
 * persistido; no es un cuarto estado de dominio.
 */
export function deriveChoreographyNeedsAttention(
  states: InscriptionFinancialState[],
): boolean {
  if (states.length === 0) {
    return false;
  }

  const firstState = states[0];

  return states.some((state) => state !== firstState);
}

/**
 * Porcentaje de `Descuento por bailarín` según cuántas inscripciones activas
 * `señadas`/`pagadas` tiene el mismo bailarín en el mismo evento y academia.
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
 * `Descuento por bailarín` por inscripción. Cuenta sólo inscripciones activas
 * `señadas`/`pagadas` del mismo bailarín. Una inscripción queda sin descuento:
 * la última al ordenar por precio base y (desempate) por id.
 */
export function computeDancerDiscountAmounts(
  qualifyingInscriptions: Array<{
    id: string;
    frozenBasePriceAmount: number;
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
    (a, b) =>
      b.frozenBasePriceAmount - a.frozenBasePriceAmount ||
      a.id.localeCompare(b.id),
  );

  ordered.forEach((inscription, index) => {
    if (index === 0) {
      discounts.set(inscription.id, { amount: 0, percentage: 0 });
      return;
    }

    discounts.set(inscription.id, {
      amount: Math.round(
        (inscription.frozenBasePriceAmount * percentage) / 100,
      ),
      percentage,
    });
  });

  return discounts;
}

export function buildChoreographyOperationalFinanceRow(input: {
  choreography: FinanceChoreographyRow;
  inscriptions: ResolvedInscription[];
}): ChoreographyOperationalFinanceRow {
  const states = input.inscriptions.map((inscription) => inscription.state);

  let totalBase = 0;
  let baseMissingPriceCount = 0;
  let totalDeposit = 0;
  let depositMissingPriceCount = 0;
  let paidAmount = 0;
  let grossOwedAmount = 0;
  let owedMissingPriceCount = 0;
  let owedDepositAmount = 0;
  let owedDepositMissingPriceCount = 0;
  let depositCompletedOn: string | null = null;

  for (const inscription of input.inscriptions) {
    paidAmount += inscription.paidAmount;

    if (inscription.basePriceAmount === null) {
      baseMissingPriceCount++;
    } else {
      totalBase += inscription.basePriceAmount;
    }

    if (inscription.depositAmount === null) {
      depositMissingPriceCount++;
    } else {
      totalDeposit += inscription.depositAmount;
    }

    if (inscription.state !== "impaga" && inscription.depositReferenceDate) {
      depositCompletedOn = laterDate(
        depositCompletedOn,
        inscription.depositReferenceDate,
      );
    }

    if (inscription.state === "impaga") {
      if (inscription.depositAmount === null) {
        owedMissingPriceCount++;
        owedDepositMissingPriceCount++;
      } else {
        grossOwedAmount += inscription.depositAmount;
        owedDepositAmount += inscription.depositAmount;
      }
    } else if (inscription.state === "señada") {
      grossOwedAmount += inscription.balancePendingAmount;
    }
  }

  return {
    basePriceAmount: buildOperationalFinanceAmount({
      amount: totalBase,
      missingPriceCount: baseMissingPriceCount,
    }),
    depositAmount: buildOperationalFinanceAmount({
      amount: totalDeposit,
      missingPriceCount: depositMissingPriceCount,
    }),
    depositCompletedOn,
    financialState: deriveChoreographyFinancialState(states),
    needsAttention: deriveChoreographyNeedsAttention(states),
    groupType: input.choreography.groupType,
    id: input.choreography.id,
    name: input.choreography.name,
    owedAmount: buildOperationalFinanceAmount({
      amount: grossOwedAmount,
      missingPriceCount: owedMissingPriceCount,
    }),
    owedDepositAmount: buildOperationalFinanceAmount({
      amount: owedDepositAmount,
      missingPriceCount: owedDepositMissingPriceCount,
    }),
    paidAmount,
    registrationCount: input.inscriptions.length,
  };
}

export function buildOperationalFinanceSummaryFromChoreographyRows(input: {
  availableBalanceAmount: number;
  choreographyFinanceRows: ChoreographyOperationalFinanceRow[];
  totalPaidAmount: number;
}): OperationalFinanceSummary {
  const owedDepositAmount = sumOperationalFinanceAmounts(
    input.choreographyFinanceRows.map((row) => row.owedDepositAmount),
  );
  const grossOwedAmount = sumOperationalFinanceAmounts(
    input.choreographyFinanceRows.map((row) => row.owedAmount),
  );

  return {
    availableBalanceAmount: input.availableBalanceAmount,
    owedAmount: buildOperationalFinanceAmount({
      amount: Math.max(
        0,
        grossOwedAmount.amount - input.availableBalanceAmount,
      ),
      missingPriceCount: grossOwedAmount.missingPriceCount,
    }),
    owedDepositAmount: buildOperationalFinanceAmount({
      amount: owedDepositAmount.amount,
      missingPriceCount: owedDepositAmount.missingPriceCount,
    }),
    totalPaidAmount: input.totalPaidAmount,
  };
}

/**
 * Precio tentativo vigente para una inscripción `impaga`, contra la fecha de
 * negocio de Córdoba. `missing-price` cuando no hay fila de precio aplicable.
 */
export function resolveEstimatedBasePriceAmount(input: {
  choreography: Pick<
    FinanceChoreographyRow,
    "groupType" | "choreographyScheduleId" | "scheduleCapacityScheduleId"
  >;
  priceRows: FinancePriceRow[];
}): FinanceAmountResolution {
  const financialReferenceDate = getBusinessDateOnly();
  const scheduleId =
    input.choreography.scheduleCapacityScheduleId ??
    input.choreography.choreographyScheduleId;
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

export function calculateDepositAmount(input: {
  amount: number;
  percentage: number;
}) {
  return Math.round((input.amount * input.percentage) / 100);
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

function laterDate(current: string | null, candidate: string): string {
  if (current === null) {
    return candidate;
  }

  return candidate.localeCompare(current) > 0 ? candidate : current;
}

import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  payments,
  choreographies,
  choreographyDancers,
  events,
  paymentAllocations,
  prices,
  scheduleCapacities,
} from "@/db/schema";
import { resolveChoreographyPricingScheduleId } from "@/lib/finances/choreography-pricing-schedule";
import {
  computeDancerDiscountAmounts,
  deriveInscriptionFinancialState,
} from "@/lib/finances/operational-summary-calculations.server";
import { selectApplicablePriceFromCandidates } from "@/lib/prices/repository.server";

export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type FinancePriceRow = typeof prices.$inferSelect;

export type InscriptionRow = typeof choreographyDancers.$inferSelect;

/**
 * Resultado de una operación de cobro. Cuando `ok` es `false`, `message` es un
 * texto listo para mostrar en la UI administrativa.
 */
export type CobroResult = { ok: true } | { ok: false; message: string };

/**
 * Piso del cobro por inscripción: `min(frozenBasePriceAmount)` sobre las
 * inscripciones activas ya `señada`/`pagada`, excluyendo la huérfana objetivo.
 * `null` cuando ninguna hermana está congelada (la coreografía no es mixta).
 */
export function resolveInscriptionDepositFloor(
  inscriptions: InscriptionRow[],
  excludeInscriptionId: string | null,
): number | null {
  const frozenAmounts = inscriptions
    .filter((inscription) => inscription.id !== excludeInscriptionId)
    .filter((inscription) => {
      const state = deriveInscriptionFinancialState(inscription);
      return state === "señada" || state === "pagada";
    })
    .map((inscription) => inscription.frozenBasePriceAmount ?? 0);

  if (frozenAmounts.length === 0) {
    return null;
  }

  return Math.min(...frozenAmounts);
}

/**
 * Carga la fila de precio elegida validando que pertenezca al conjunto candidato
 * de la coreografía: mismo evento, mismo `groupType` y cronograma (una fila
 * específica del cronograma o una general), sin filtrar por fecha.
 */
export async function loadCandidatePriceRow(
  tx: Transaction,
  input: {
    eventId: string;
    groupType: string;
    priceId: string;
    scheduleId: string | null;
  },
): Promise<FinancePriceRow | null> {
  const price = await tx.query.prices.findFirst({
    where: and(eq(prices.id, input.priceId), eq(prices.eventId, input.eventId)),
  });

  if (
    !price ||
    price.groupType !== input.groupType ||
    (price.scheduleId !== null && price.scheduleId !== input.scheduleId)
  ) {
    return null;
  }

  return price;
}

/**
 * Cabecera común de la carga de una coreografía para pricing: trae el `groupType`
 * y los dos orígenes posibles del cronograma (la fila directa o la de la capacidad
 * asociada), más la identidad para validar pertenencia. El cronograma efectivo se
 * resuelve con `resolveChoreographyPricingScheduleId`. Acepta la conexión o una
 * transacción; devuelve `null` si la coreografía no existe.
 */
export async function loadChoreographyScheduleRow(
  executor: Transaction | typeof db,
  choreographyId: string,
) {
  const [choreographyRow] = await executor
    .select({
      academyId: choreographies.academyId,
      eventId: choreographies.eventId,
      groupType: choreographies.groupType,
      choreographyScheduleId: choreographies.scheduleId,
      scheduleCapacityScheduleId: scheduleCapacities.scheduleId,
    })
    .from(choreographies)
    .leftJoin(
      scheduleCapacities,
      eq(choreographies.scheduleCapacityId, scheduleCapacities.id),
    )
    .where(eq(choreographies.id, choreographyId));

  return choreographyRow ?? null;
}

export type CobroContext =
  | { ok: false; message: string }
  | {
      ok: true;
      choreography: {
        groupType: string;
        scheduleId: string | null;
      };
      event: { requiredDepositPercentage: number };
      inscriptions: InscriptionRow[];
      payment: typeof payments.$inferSelect;
    };

export async function loadCobroContext(
  tx: Transaction,
  input: {
    academyId: string;
    choreographyId: string;
    eventId: string;
    paymentId: string;
  },
): Promise<CobroContext> {
  const choreographyRow = await loadChoreographyScheduleRow(
    tx,
    input.choreographyId,
  );

  if (
    !choreographyRow ||
    choreographyRow.academyId !== input.academyId ||
    choreographyRow.eventId !== input.eventId
  ) {
    return { ok: false, message: "No encontramos esa coreografía." };
  }

  const event = await tx.query.events.findFirst({
    columns: { requiredDepositPercentage: true },
    where: eq(events.id, input.eventId),
  });

  if (!event) {
    return { ok: false, message: "No encontramos el evento." };
  }

  const inscriptions = await tx.query.choreographyDancers.findMany({
    where: eq(choreographyDancers.choreographyId, input.choreographyId),
  });

  if (inscriptions.length === 0) {
    return {
      ok: false,
      message: "La coreografía no tiene inscripciones activas.",
    };
  }

  const payment = await tx.query.payments.findFirst({
    where: and(
      eq(payments.id, input.paymentId),
      eq(payments.academyId, input.academyId),
      eq(payments.eventId, input.eventId),
    ),
  });

  if (!payment) {
    return { ok: false, message: "No encontramos ese pago." };
  }

  return {
    ok: true,
    choreography: {
      groupType: choreographyRow.groupType,
      scheduleId: resolveChoreographyPricingScheduleId(choreographyRow),
    },
    event,
    inscriptions,
    payment,
  };
}

/**
 * Selecciona la fila de precio vigente para un tipo de grupo y cronograma contra
 * `paymentDate`, priorizando el precio específico del cronograma sobre el
 * general. Consulta con la transacción activa para no abrir una conexión nueva.
 */
export async function resolveApplicablePriceRow(
  tx: Transaction,
  input: {
    eventId: string;
    groupType: string;
    paymentDate: string;
    scheduleId: string | null;
  },
) {
  const priceRows = (
    await tx.query.prices.findMany({
      where: eq(prices.eventId, input.eventId),
    })
  ).filter((price) => price.groupType === input.groupType);

  return selectApplicablePriceRow({
    priceRows,
    referenceDate: input.paymentDate,
    scheduleId: input.scheduleId,
  });
}

/**
 * Elige entre filas ya cargadas y filtradas por tipo de grupo, priorizando el
 * precio específico del cronograma sobre el general. Es la regla que comparten
 * el cobro y su cotización previa, para que ambos lleguen al mismo precio.
 */
export function selectApplicablePriceRow(input: {
  priceRows: FinancePriceRow[];
  referenceDate: string;
  scheduleId: string | null;
}) {
  if (input.scheduleId) {
    const specificPrice = selectApplicablePriceFromCandidates(
      input.priceRows.filter((price) => price.scheduleId === input.scheduleId),
      input.referenceDate,
    );

    if (specificPrice) {
      return specificPrice;
    }
  }

  return selectApplicablePriceFromCandidates(
    input.priceRows.filter((price) => price.scheduleId === null),
    input.referenceDate,
  );
}

export async function assertPaymentAvailability(
  tx: Transaction,
  input: {
    payment: typeof payments.$inferSelect;
    requiredAmount: number;
  },
): Promise<CobroResult> {
  const allocations = await tx.query.paymentAllocations.findMany({
    columns: { amount: true },
    where: eq(paymentAllocations.paymentId, input.payment.id),
  });
  const allocatedAmount = allocations.reduce(
    (sum, allocation) => sum + allocation.amount,
    0,
  );
  const availableAmount = input.payment.amount - allocatedAmount;

  if (availableAmount < input.requiredAmount) {
    return {
      ok: false,
      message: "El pago no tiene saldo disponible suficiente.",
    };
  }

  return { ok: true };
}

export async function resolveDancerDiscounts(
  tx: Transaction,
  input: {
    academyId: string;
    eventId: string;
    inscriptions: InscriptionRow[];
  },
) {
  const dancerIds = [
    ...new Set(input.inscriptions.map((inscription) => inscription.dancerId)),
  ];

  const qualifyingRows = await tx
    .select({
      id: choreographyDancers.id,
      dancerId: choreographyDancers.dancerId,
      frozenBasePriceAmount: choreographyDancers.frozenBasePriceAmount,
      depositReferenceDate: choreographyDancers.depositReferenceDate,
      balanceReferenceDate: choreographyDancers.balanceReferenceDate,
    })
    .from(choreographyDancers)
    .innerJoin(
      choreographies,
      eq(choreographyDancers.choreographyId, choreographies.id),
    )
    .where(
      and(
        eq(choreographies.academyId, input.academyId),
        eq(choreographies.eventId, input.eventId),
        inArray(choreographyDancers.dancerId, dancerIds),
      ),
    );

  const qualifyingByDancer = new Map<
    string,
    Array<{ id: string; frozenBasePriceAmount: number }>
  >();
  for (const row of qualifyingRows) {
    const state = deriveInscriptionFinancialState(row);
    if (
      (state !== "señada" && state !== "pagada") ||
      row.frozenBasePriceAmount === null
    ) {
      continue;
    }

    const bucket = qualifyingByDancer.get(row.dancerId);
    const entry = {
      frozenBasePriceAmount: row.frozenBasePriceAmount,
      id: row.id,
    };
    if (bucket) {
      bucket.push(entry);
    } else {
      qualifyingByDancer.set(row.dancerId, [entry]);
    }
  }

  const discounts = new Map<string, { amount: number; percentage: number }>();
  for (const group of qualifyingByDancer.values()) {
    for (const [id, discount] of computeDancerDiscountAmounts(group)) {
      discounts.set(id, discount);
    }
  }

  return discounts;
}

export function clearDepositSnapshot() {
  return {
    frozenBasePriceAmount: null,
    selectedPriceId: null,
    depositReferenceDate: null,
    depositPercentage: null,
    depositAmount: null,
  };
}

export function clearBalanceSnapshot() {
  return {
    balanceReferenceDate: null,
    appliedDancerDiscountPercentage: null,
    appliedDancerDiscountAmount: null,
    finalTotalAmount: null,
    balanceAmount: null,
    balanceCompletedAt: null,
  };
}

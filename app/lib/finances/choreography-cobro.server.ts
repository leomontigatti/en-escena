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
  calculateDepositAmount,
  computeDancerDiscountAmounts,
  deriveInscriptionFinancialState,
} from "@/lib/finances/operational-summary-calculations.server";
import { selectApplicablePriceFromCandidates } from "@/lib/prices/repository.server";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

type AllocationType =
  (typeof paymentAllocations.$inferSelect)["allocationType"];

type FinancePriceRow = typeof prices.$inferSelect;

/**
 * Resultado de una operación de cobro. Cuando `ok` es `false`, `message` es un
 * texto listo para mostrar en la UI administrativa.
 */
export type CobroResult = { ok: true } | { ok: false; message: string };

type InscriptionRow = typeof choreographyDancers.$inferSelect;

/**
 * `Pagar seña` de una coreografía completa. Solo procede si todas las
 * inscripciones activas están `impagas`. Crea una asignación `deposit` por
 * inscripción y congela el snapshot de seña (precio base, seña y fila de precio
 * derivada de `payment.date`).
 */
export async function payChoreographyDeposit(input: {
  academyId: string;
  choreographyId: string;
  eventId: string;
  paymentId: string;
}): Promise<CobroResult> {
  return await db.transaction(async (tx) => {
    const context = await loadCobroContext(tx, input);
    if (!context.ok) {
      return context;
    }

    const { choreography, event, inscriptions, payment } = context;

    if (
      !inscriptions.every(
        (inscription) =>
          deriveInscriptionFinancialState(inscription) === "impaga",
      )
    ) {
      return {
        ok: false,
        message:
          "Solo se puede pagar la seña si todas las inscripciones están impagas.",
      };
    }

    const price = await resolveApplicablePriceRow(tx, {
      eventId: input.eventId,
      groupType: choreography.groupType,
      paymentDate: payment.paymentDate,
      scheduleId: choreography.scheduleId,
    });

    if (!price) {
      return {
        ok: false,
        message:
          "No hay un precio configurado para este tipo de grupo y cronograma.",
      };
    }

    const depositAmount = calculateDepositAmount({
      amount: price.amount,
      percentage: event.requiredDepositPercentage,
    });
    const totalDeposit = depositAmount * inscriptions.length;

    const availability = await assertPaymentAvailability(tx, {
      payment,
      requiredAmount: totalDeposit,
    });
    if (!availability.ok) {
      return availability;
    }

    for (const inscription of inscriptions) {
      await tx
        .update(choreographyDancers)
        .set({
          frozenBasePriceAmount: price.amount,
          selectedPriceId: price.id,
          depositReferenceDate: payment.paymentDate,
          depositPercentage: event.requiredDepositPercentage,
          depositAmount,
        })
        .where(eq(choreographyDancers.id, inscription.id));

      await tx.insert(paymentAllocations).values({
        academyId: input.academyId,
        allocationType: "deposit",
        amount: depositAmount,
        eventId: input.eventId,
        inscriptionId: inscription.id,
        paymentId: payment.id,
      });
    }

    return { ok: true };
  });
}

/**
 * Cobro extraordinario de seña de **una sola inscripción** huérfana en una
 * coreografía mixta. A diferencia del flujo por coreografía entera, la fila de
 * precio la elige el administrador (no se deriva de la fecha) y solo se congela
 * el snapshot de esa inscripción; sus hermanas quedan intactas. `payment.date`
 * se guarda como fecha de referencia del snapshot.
 *
 * Reglas que se aplican en el server:
 * - La inscripción objetivo debe estar `impaga`.
 * - Solo procede en coreografías **mixtas** (alguna hermana ya `señada` o
 *   `pagada`); en una coreografía 100% `impaga` el primer congelamiento es el
 *   del flujo normal por coreografía entera.
 * - La fila elegida debe pertenecer al conjunto candidato (mismo `groupType` y
 *   cronograma) y cumplir `price.amount >= piso`, con el piso =
 *   `min(frozenBasePriceAmount)` sobre las hermanas activas ya `señada`/`pagada`.
 */
export async function payInscriptionDeposit(input: {
  academyId: string;
  choreographyId: string;
  eventId: string;
  inscriptionId: string;
  paymentId: string;
  priceId: string;
}): Promise<CobroResult> {
  return await db.transaction(async (tx) => {
    const context = await loadCobroContext(tx, input);
    if (!context.ok) {
      return context;
    }

    const { choreography, event, inscriptions, payment } = context;

    const target = inscriptions.find(
      (inscription) => inscription.id === input.inscriptionId,
    );
    if (!target) {
      return { ok: false, message: "No encontramos esa inscripción." };
    }

    if (deriveInscriptionFinancialState(target) !== "impaga") {
      return {
        ok: false,
        message: "Esta inscripción ya tiene la seña congelada.",
      };
    }

    const floor = resolveInscriptionDepositFloor(inscriptions, target.id);
    if (floor === null) {
      return {
        ok: false,
        message:
          "El cobro por inscripción solo aplica en coreografías con otra inscripción ya señada.",
      };
    }

    const price = await loadCandidatePriceRow(tx, {
      eventId: input.eventId,
      groupType: choreography.groupType,
      priceId: input.priceId,
      scheduleId: choreography.scheduleId,
    });
    if (!price) {
      return { ok: false, message: "No encontramos esa fila de precio." };
    }

    if (price.amount < floor) {
      return {
        ok: false,
        message:
          "La fila de precio no puede ser menor que el piso de la coreografía.",
      };
    }

    const depositAmount = calculateDepositAmount({
      amount: price.amount,
      percentage: event.requiredDepositPercentage,
    });

    const availability = await assertPaymentAvailability(tx, {
      payment,
      requiredAmount: depositAmount,
    });
    if (!availability.ok) {
      return availability;
    }

    await tx
      .update(choreographyDancers)
      .set({
        frozenBasePriceAmount: price.amount,
        selectedPriceId: price.id,
        depositReferenceDate: payment.paymentDate,
        depositPercentage: event.requiredDepositPercentage,
        depositAmount,
      })
      .where(eq(choreographyDancers.id, target.id));

    await tx.insert(paymentAllocations).values({
      academyId: input.academyId,
      allocationType: "deposit",
      amount: depositAmount,
      eventId: input.eventId,
      inscriptionId: target.id,
      paymentId: payment.id,
    });

    return { ok: true };
  });
}

/**
 * Opciones para el cobro de seña por inscripción de una coreografía. Devuelve
 * `null` cuando la coreografía **no** es mixta (no hay huérfana `impaga` con al
 * menos una hermana ya `señada`/`pagada`), que es cuando este flujo no se
 * ofrece. El conjunto de filas de precio candidatas es el de mismo `groupType` y
 * cronograma, sin filtrar por fecha, acotado por el piso.
 */
export async function readInscriptionDepositOptions(input: {
  choreographyId: string;
  eventId: string;
}): Promise<{
  floor: number;
  priceRows: Array<{
    id: string;
    name: string;
    amount: number;
    depositAmount: number;
  }>;
} | null> {
  const [choreographyRow] = await db
    .select({
      groupType: choreographies.groupType,
      choreographyScheduleId: choreographies.scheduleId,
      scheduleCapacityScheduleId: scheduleCapacities.scheduleId,
    })
    .from(choreographies)
    .leftJoin(
      scheduleCapacities,
      eq(choreographies.scheduleCapacityId, scheduleCapacities.id),
    )
    .where(eq(choreographies.id, input.choreographyId));

  if (!choreographyRow) {
    return null;
  }

  const [event, inscriptions] = await Promise.all([
    db.query.events.findFirst({
      columns: { requiredDepositPercentage: true },
      where: eq(events.id, input.eventId),
    }),
    db.query.choreographyDancers.findMany({
      where: eq(choreographyDancers.choreographyId, input.choreographyId),
    }),
  ]);

  if (!event) {
    return null;
  }

  const floor = resolveInscriptionDepositFloor(inscriptions, null);
  const hasOrphan = inscriptions.some(
    (inscription) => deriveInscriptionFinancialState(inscription) === "impaga",
  );
  if (floor === null || !hasOrphan) {
    return null;
  }

  const scheduleId = resolveChoreographyPricingScheduleId(choreographyRow);
  const priceRows = (
    await db.query.prices.findMany({ where: eq(prices.eventId, input.eventId) })
  )
    .filter(
      (price) =>
        price.groupType === choreographyRow.groupType &&
        (price.scheduleId === null || price.scheduleId === scheduleId) &&
        price.amount >= floor,
    )
    .map((price) => ({
      id: price.id,
      name: price.name,
      amount: price.amount,
      depositAmount: calculateDepositAmount({
        amount: price.amount,
        percentage: event.requiredDepositPercentage,
      }),
    }))
    .sort((a, b) => a.amount - b.amount);

  return { floor, priceRows };
}

/**
 * Piso del cobro por inscripción: `min(frozenBasePriceAmount)` sobre las
 * inscripciones activas ya `señada`/`pagada`, excluyendo la huérfana objetivo.
 * `null` cuando ninguna hermana está congelada (la coreografía no es mixta).
 */
function resolveInscriptionDepositFloor(
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
async function loadCandidatePriceRow(
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
 * Cotiza cuánto costaría la seña completa de una coreografía por cada fecha
 * candidata, resolviendo el precio igual que `payChoreographyDeposit`: contra la
 * fecha del pago, no contra hoy. Mientras la coreografía sigue `impaga` su
 * precio no está congelado, así que un pago fechado antes de un aumento paga el
 * precio de su fecha. Cotizar con la misma regla que cobra evita ofrecer pagos
 * que el cobro rechazaría, y esconder los que sí acepta.
 *
 * Devuelve el total por fecha; omite las fechas sin precio aplicable.
 */
export async function quoteChoreographyDepositTotals(input: {
  choreographyId: string;
  eventId: string;
  referenceDates: string[];
}): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  const uniqueDates = [...new Set(input.referenceDates)];

  if (uniqueDates.length === 0) {
    return totals;
  }

  const [choreographyRow] = await db
    .select({
      groupType: choreographies.groupType,
      choreographyScheduleId: choreographies.scheduleId,
      scheduleCapacityScheduleId: scheduleCapacities.scheduleId,
    })
    .from(choreographies)
    .leftJoin(
      scheduleCapacities,
      eq(choreographies.scheduleCapacityId, scheduleCapacities.id),
    )
    .where(eq(choreographies.id, input.choreographyId));

  if (!choreographyRow) {
    return totals;
  }

  const scheduleId = resolveChoreographyPricingScheduleId(choreographyRow);

  const [event, inscriptionRows, priceRows] = await Promise.all([
    db.query.events.findFirst({
      columns: { requiredDepositPercentage: true },
      where: eq(events.id, input.eventId),
    }),
    db
      .select({ id: choreographyDancers.id })
      .from(choreographyDancers)
      .where(eq(choreographyDancers.choreographyId, input.choreographyId)),
    db.query.prices.findMany({ where: eq(prices.eventId, input.eventId) }),
  ]);

  if (!event || inscriptionRows.length === 0) {
    return totals;
  }

  const candidatePriceRows = priceRows.filter(
    (price) => price.groupType === choreographyRow.groupType,
  );

  for (const referenceDate of uniqueDates) {
    const price = selectApplicablePriceRow({
      priceRows: candidatePriceRows,
      referenceDate,
      scheduleId,
    });

    if (!price) {
      continue;
    }

    const depositAmount = calculateDepositAmount({
      amount: price.amount,
      percentage: event.requiredDepositPercentage,
    });

    totals.set(referenceDate, depositAmount * inscriptionRows.length);
  }

  return totals;
}

/**
 * `Pagar saldo` de una coreografía completa. Solo procede si todas las
 * inscripciones activas están `señadas`. Crea una asignación `balance` por
 * inscripción y congela el snapshot de saldo, incluyendo el `Descuento por
 * bailarín` estimado al momento (congelamiento secuencial e irreversible).
 */
export async function payChoreographyBalance(input: {
  academyId: string;
  choreographyId: string;
  eventId: string;
  paymentId: string;
}): Promise<CobroResult> {
  return await db.transaction(async (tx) => {
    const context = await loadCobroContext(tx, input);
    if (!context.ok) {
      return context;
    }

    const { inscriptions, payment } = context;

    if (
      !inscriptions.every(
        (inscription) =>
          deriveInscriptionFinancialState(inscription) === "señada",
      )
    ) {
      return {
        ok: false,
        message:
          "Solo se puede pagar el saldo si todas las inscripciones están señadas.",
      };
    }

    const discounts = await resolveDancerDiscounts(tx, {
      academyId: input.academyId,
      eventId: input.eventId,
      inscriptions,
    });

    const balances = inscriptions.map((inscription) => {
      const frozenBasePriceAmount = inscription.frozenBasePriceAmount ?? 0;
      const depositAmount = inscription.depositAmount ?? 0;
      const discount = discounts.get(inscription.id) ?? {
        amount: 0,
        percentage: 0,
      };
      const finalTotalAmount = frozenBasePriceAmount - discount.amount;
      const balanceAmount = Math.max(0, finalTotalAmount - depositAmount);

      return { balanceAmount, discount, finalTotalAmount, inscription };
    });

    const totalBalance = balances.reduce(
      (sum, entry) => sum + entry.balanceAmount,
      0,
    );

    const availability = await assertPaymentAvailability(tx, {
      payment,
      requiredAmount: totalBalance,
    });
    if (!availability.ok) {
      return availability;
    }

    for (const entry of balances) {
      await tx
        .update(choreographyDancers)
        .set({
          balanceReferenceDate: payment.paymentDate,
          appliedDancerDiscountPercentage: entry.discount.percentage,
          appliedDancerDiscountAmount: entry.discount.amount,
          finalTotalAmount: entry.finalTotalAmount,
          balanceAmount: entry.balanceAmount,
          balanceCompletedAt: payment.paymentDate,
        })
        .where(eq(choreographyDancers.id, entry.inscription.id));

      await tx.insert(paymentAllocations).values({
        academyId: input.academyId,
        allocationType: "balance",
        amount: entry.balanceAmount,
        eventId: input.eventId,
        inscriptionId: entry.inscription.id,
        paymentId: payment.id,
      });
    }

    return { ok: true };
  });
}

/**
 * Cobro extraordinario de saldo de **una sola inscripción** `señada` huérfana en
 * una coreografía mixta. A diferencia del flujo por coreografía entera, solo
 * congela el snapshot de saldo de esa inscripción; sus hermanas quedan intactas.
 * `payment.date` se guarda como fecha de referencia y de completado.
 *
 * Reglas que se aplican en el server:
 * - La inscripción objetivo debe estar `señada` (seña congelada, saldo
 *   pendiente).
 * - Solo procede en coreografías **mixtas** (alguna hermana en otro estado); en
 *   una coreografía 100% `señada` el primer congelamiento de saldo es el del
 *   flujo normal por coreografía entera.
 * - El `Descuento por bailarín` se calcula contra el roster `señada`/`pagada`
 *   vigente de esa inscripción, con la asimetría aceptada respecto de las
 *   hermanas ya `pagada` (congelamiento secuencial e irreversible).
 */
export async function payInscriptionBalance(input: {
  academyId: string;
  choreographyId: string;
  eventId: string;
  inscriptionId: string;
  paymentId: string;
}): Promise<CobroResult> {
  return await db.transaction(async (tx) => {
    const context = await loadCobroContext(tx, input);
    if (!context.ok) {
      return context;
    }

    const { inscriptions, payment } = context;

    const target = inscriptions.find(
      (inscription) => inscription.id === input.inscriptionId,
    );
    if (!target) {
      return { ok: false, message: "No encontramos esa inscripción." };
    }

    if (deriveInscriptionFinancialState(target) !== "señada") {
      return {
        ok: false,
        message: "Esta inscripción no tiene un saldo pendiente de cobro.",
      };
    }

    if (
      inscriptions.every(
        (inscription) =>
          deriveInscriptionFinancialState(inscription) === "señada",
      )
    ) {
      return {
        ok: false,
        message:
          "El cobro de saldo por inscripción solo aplica en coreografías mixtas; usá Pagar saldo.",
      };
    }

    const discounts = await resolveDancerDiscounts(tx, {
      academyId: input.academyId,
      eventId: input.eventId,
      inscriptions,
    });
    const discount = discounts.get(target.id) ?? { amount: 0, percentage: 0 };
    const frozenBasePriceAmount = target.frozenBasePriceAmount ?? 0;
    const depositAmount = target.depositAmount ?? 0;
    const finalTotalAmount = frozenBasePriceAmount - discount.amount;
    const balanceAmount = Math.max(0, finalTotalAmount - depositAmount);

    const availability = await assertPaymentAvailability(tx, {
      payment,
      requiredAmount: balanceAmount,
    });
    if (!availability.ok) {
      return availability;
    }

    await tx
      .update(choreographyDancers)
      .set({
        balanceReferenceDate: payment.paymentDate,
        appliedDancerDiscountPercentage: discount.percentage,
        appliedDancerDiscountAmount: discount.amount,
        finalTotalAmount,
        balanceAmount,
        balanceCompletedAt: payment.paymentDate,
      })
      .where(eq(choreographyDancers.id, target.id));

    await tx.insert(paymentAllocations).values({
      academyId: input.academyId,
      allocationType: "balance",
      amount: balanceAmount,
      eventId: input.eventId,
      inscriptionId: target.id,
      paymentId: payment.id,
    });

    return { ok: true };
  });
}

/**
 * Borra una asignación de pago y limpia el snapshot correspondiente, devolviendo
 * la inscripción al estado anterior: borrar la `deposit` la deja `impaga`;
 * borrar la `balance` la deja `señada`. El monto liberado vuelve al `Saldo
 * disponible` de la academia (derivado de pagos − asignaciones).
 */
export async function deletePaymentAllocation(input: {
  allocationId: string;
}): Promise<CobroResult> {
  return await db.transaction((tx) =>
    deletePaymentAllocationWithinTx(tx, input.allocationId),
  );
}

/**
 * Núcleo de `deletePaymentAllocation` que participa de una transacción externa:
 * revierte el snapshot de la inscripción y borra la asignación. Respeta el guard
 * de orden (no se puede borrar la `deposit` de una inscripción `pagada` sin
 * borrar antes su `balance`). Reutilizado por la cascada al eliminar un pago.
 */
async function deletePaymentAllocationWithinTx(
  tx: Transaction,
  allocationId: string,
): Promise<CobroResult> {
  const allocation = await tx.query.paymentAllocations.findFirst({
    where: eq(paymentAllocations.id, allocationId),
  });

  if (!allocation) {
    return { ok: false, message: "No encontramos esa asignación." };
  }

  const inscription = await tx.query.choreographyDancers.findFirst({
    where: eq(choreographyDancers.id, allocation.inscriptionId),
  });

  if (!inscription) {
    return { ok: false, message: "No encontramos esa inscripción." };
  }

  if (allocation.allocationType === "deposit") {
    if (deriveInscriptionFinancialState(inscription) === "pagada") {
      return {
        ok: false,
        message: DEPOSIT_BEFORE_BALANCE_MESSAGE,
      };
    }

    await tx
      .update(choreographyDancers)
      .set(clearDepositSnapshot())
      .where(eq(choreographyDancers.id, inscription.id));
  } else {
    await tx
      .update(choreographyDancers)
      .set(clearBalanceSnapshot())
      .where(eq(choreographyDancers.id, inscription.id));
  }

  await tx
    .delete(paymentAllocations)
    .where(eq(paymentAllocations.id, allocation.id));

  return { ok: true };
}

/**
 * Elimina un pago arrastrando en cascada todas sus asignaciones, dentro de una
 * sola transacción. Revierte el snapshot de cada inscripción reusando la lógica
 * de `deletePaymentAllocation`. Las asignaciones de `balance` se borran antes
 * que las de `deposit` para que el guard de orden pase en el caso común (seña y
 * saldo en el mismo pago). Si alguna inscripción queda con el saldo pagado en
 * otro pago, el guard bloquea, se hace rollback total y se informa.
 */
export async function deletePaymentWithAllocations(input: {
  paymentId: string;
}): Promise<CobroResult> {
  try {
    await db.transaction(async (tx) => {
      const allocations = await tx.query.paymentAllocations.findMany({
        where: eq(paymentAllocations.paymentId, input.paymentId),
      });

      // `balance` antes que `deposit`: así, cuando ambos están en este pago, al
      // llegar a la seña la inscripción ya no está `pagada` y el guard pasa.
      const ordered = [...allocations].sort(
        (a, b) =>
          allocationDeletionRank(a.allocationType) -
          allocationDeletionRank(b.allocationType),
      );

      for (const allocation of ordered) {
        const result = await deletePaymentAllocationWithinTx(tx, allocation.id);
        if (!result.ok) {
          // El guard de orden significa que el saldo vive en otro pago: se
          // traduce a un mensaje a nivel pago. Cualquier otra causa se propaga
          // tal cual para no ocultar el error real.
          throw new PaymentCascadeBlockedError(
            result.message === DEPOSIT_BEFORE_BALANCE_MESSAGE
              ? "No se pudo eliminar el pago: hay coreografías con el saldo pagado en otro pago. Desasigná ese saldo primero."
              : result.message,
          );
        }
      }

      await tx.delete(payments).where(eq(payments.id, input.paymentId));
    });

    return { ok: true };
  } catch (error) {
    if (error instanceof PaymentCascadeBlockedError) {
      return { ok: false, message: error.message };
    }

    throw error;
  }
}

function allocationDeletionRank(allocationType: AllocationType): number {
  return allocationType === "balance" ? 0 : 1;
}

const DEPOSIT_BEFORE_BALANCE_MESSAGE =
  "Borrá primero la asignación de saldo antes de la de seña.";

class PaymentCascadeBlockedError extends Error {}

/**
 * Devuelve al `Saldo disponible` de la academia todo lo asignado a una
 * inscripción: borra sus asignaciones de pago (seña y, si existía, saldo) y
 * limpia sus snapshots. Helper consumido al quitar una inscripción del roster.
 * Acepta una transacción externa para participar del borrado del roster.
 */
export async function releaseInscriptionAllocations(
  input: { inscriptionId: string },
  tx: Transaction | typeof db = db,
): Promise<{ releasedAmount: number }> {
  const allocations = await tx.query.paymentAllocations.findMany({
    where: eq(paymentAllocations.inscriptionId, input.inscriptionId),
  });

  const releasedAmount = allocations.reduce(
    (sum, allocation) => sum + allocation.amount,
    0,
  );

  await tx
    .delete(paymentAllocations)
    .where(eq(paymentAllocations.inscriptionId, input.inscriptionId));

  await tx
    .update(choreographyDancers)
    .set({ ...clearDepositSnapshot(), ...clearBalanceSnapshot() })
    .where(eq(choreographyDancers.id, input.inscriptionId));

  return { releasedAmount };
}

type CobroContext =
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

async function loadCobroContext(
  tx: Transaction,
  input: {
    academyId: string;
    choreographyId: string;
    eventId: string;
    paymentId: string;
  },
): Promise<CobroContext> {
  const [choreographyRow] = await tx
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
    .where(eq(choreographies.id, input.choreographyId));

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
async function resolveApplicablePriceRow(
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
function selectApplicablePriceRow(input: {
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

async function assertPaymentAvailability(
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

async function resolveDancerDiscounts(
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

function clearDepositSnapshot() {
  return {
    frozenBasePriceAmount: null,
    selectedPriceId: null,
    depositReferenceDate: null,
    depositPercentage: null,
    depositAmount: null,
  };
}

function clearBalanceSnapshot() {
  return {
    balanceReferenceDate: null,
    appliedDancerDiscountPercentage: null,
    appliedDancerDiscountAmount: null,
    finalTotalAmount: null,
    balanceAmount: null,
    balanceCompletedAt: null,
  };
}

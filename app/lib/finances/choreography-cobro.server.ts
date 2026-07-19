import { eq } from "drizzle-orm";

import { db } from "@/db";
import {
  choreographyDancers,
  events,
  paymentAllocations,
  prices,
} from "@/db/schema";
import { resolveChoreographyPricingScheduleId } from "@/lib/finances/choreography-pricing-schedule";
import { todayDateOnly } from "@/lib/shared/date-only";
import {
  calculateDepositAmount,
  deriveInscriptionFinancialState,
} from "@/lib/finances/operational-summary-calculations.server";

import {
  assertPaymentAvailability,
  loadCandidatePriceRow,
  loadChoreographyScheduleRow,
  loadCobroContext,
  resolveApplicablePriceRow,
  resolveDancerDiscounts,
  resolveInscriptionDepositFloor,
  selectApplicablePriceRow,
  type CobroResult,
} from "./choreography-cobro-support.server";

export {
  deletePaymentAllocation,
  deletePaymentWithAllocations,
  releaseInscriptionAllocations,
} from "./choreography-cobro-allocations.server";
export type { CobroResult };

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
 *   cronograma) y quedar entre el piso (`min(frozenBasePriceAmount)` sobre las
 *   hermanas activas ya `señada`/`pagada`) y el techo (precio vigente hoy).
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

    // Techo: el precio vigente hoy, nunca por debajo del piso (igualar lo que
    // pagó la primera hermana señada siempre es válido). No se puede señar por
    // encima de ese techo.
    const ceilingPrice = await resolveApplicablePriceRow(tx, {
      eventId: input.eventId,
      groupType: choreography.groupType,
      paymentDate: todayDateOnly(),
      scheduleId: choreography.scheduleId,
    });

    if (ceilingPrice && price.amount > Math.max(floor, ceilingPrice.amount)) {
      return {
        ok: false,
        message:
          "La fila de precio no puede superar el precio vigente al día de hoy.",
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
 * cronograma, acotado entre el **piso** (`min(frozenBasePriceAmount)` de las
 * hermanas ya congeladas) y el **techo**: el precio vigente al día de hoy (día
 * de la consulta). No se ofrece un precio menor al que pagó la primera hermana
 * señada ni mayor al vigente hoy.
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
  const choreographyRow = await loadChoreographyScheduleRow(
    db,
    input.choreographyId,
  );

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
  const groupTypePrices = (
    await db.query.prices.findMany({ where: eq(prices.eventId, input.eventId) })
  ).filter((price) => price.groupType === choreographyRow.groupType);

  // Techo: el precio vigente hoy, resuelto con la misma regla que el cobro
  // (específico del cronograma por sobre el general). Nunca por debajo del piso:
  // igualar el precio que pagó la primera hermana señada siempre es válido, aun
  // si hoy rige un vencimiento más barato. Si hoy no hay precio aplicable, no se
  // impone techo para no ocultar todas las filas.
  const ceilingPrice = selectApplicablePriceRow({
    priceRows: groupTypePrices,
    referenceDate: todayDateOnly(),
    scheduleId,
  });
  const ceiling =
    ceilingPrice === null ? null : Math.max(floor, ceilingPrice.amount);

  const priceRows = groupTypePrices
    .filter(
      (price) =>
        (price.scheduleId === null || price.scheduleId === scheduleId) &&
        price.amount >= floor &&
        (ceiling === null || price.amount <= ceiling),
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

  const choreographyRow = await loadChoreographyScheduleRow(
    db,
    input.choreographyId,
  );

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

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { choreographyDancers, events, prices } from "@/db/schema";
import { resolveChoreographyPricingScheduleId } from "@/lib/finances/choreography-pricing-schedule";
import { getBusinessDateOnly } from "@/lib/shared/business-time-zone";
import {
  calculateDepositAmount,
  deriveInscriptionFinancialFigures,
} from "@/lib/finances/inscription-financial-status";
import { deriveInscriptionLadderStage } from "@/lib/finances/inscription-ladder-snapshot";
import { readInscriptionThresholds } from "@/lib/finances/inscription-thresholds.server";

import {
  readInscriptionAllocatedAmount,
  spreadFromPool,
} from "./allocation-pool.server";
import {
  loadCandidatePriceRow,
  loadChoreographyScheduleRow,
  loadCobroContext,
  resolveApplicablePriceRow,
  resolveInscriptionDepositFloor,
  selectApplicablePriceRow,
  type CobroResult,
  type Transaction,
} from "./choreography-cobro-support.server";

export { readChoreographyLadderStages } from "./choreography-cobro-support.server";

export {
  deletePaymentAllocation,
  releaseInscriptionAllocations,
  syncInscriptionSnapshots,
} from "./choreography-cobro-allocations.server";
export type { CobroResult };

/**
 * Los dos umbrales contra los que una preset de cobro puede saldar. `deposit`
 * asigna hasta la `Seña`; `total` asigna hasta el `Total`.
 */
type CobroThreshold = "deposit" | "total";

/**
 * `Pagar seña` de una coreografía completa. Solo procede si todas las
 * inscripciones activas están `impagas`. Congela el snapshot de seña (precio
 * base, seña y fila de precio vigente hoy) y asigna a cada inscripción lo que
 * adeuda contra su seña, tomándolo del `Saldo disponible` de la academia.
 *
 * Ya no se nombra un pago: la preset resuelve un monto y el pool decide de qué
 * pagos sale.
 */
export async function payChoreographyDeposit(input: {
  academyId: string;
  choreographyId: string;
  eventId: string;
}): Promise<CobroResult> {
  return await db.transaction(async (tx) => {
    const context = await loadCobroContext(tx, input);
    if (!context.ok) {
      return context;
    }

    const { choreography, event, inscriptions } = context;

    if (
      !inscriptions.every(
        (inscription) => deriveInscriptionLadderStage(inscription) === "impaga",
      )
    ) {
      return {
        ok: false,
        message:
          "Solo se puede pagar la seña si todas las inscripciones están impagas.",
      };
    }

    const referenceDate = getBusinessDateOnly();
    const price = await resolveApplicablePriceRow(tx, {
      eventId: input.eventId,
      groupType: choreography.groupType,
      referenceDate,
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
      priceAmount: price.amount,
      requiredDepositPercentage: event.requiredDepositPercentage,
    });

    for (const inscription of inscriptions) {
      await tx
        .update(choreographyDancers)
        .set({
          frozenBasePriceAmount: price.amount,
          selectedPriceId: price.id,
          depositReferenceDate: referenceDate,
          depositPercentage: event.requiredDepositPercentage,
          depositAmount,
        })
        .where(eq(choreographyDancers.id, inscription.id));
    }

    return await fundOwedThreshold(tx, {
      academyId: input.academyId,
      eventId: input.eventId,
      inscriptionIds: inscriptions.map((inscription) => inscription.id),
      threshold: "deposit",
    });
  });
}

/**
 * Cobro extraordinario de seña de **una sola inscripción** huérfana en una
 * coreografía mixta. A diferencia del flujo por coreografía entera, la fila de
 * precio la elige el administrador (no se deriva de la fecha) y solo se congela
 * el snapshot de esa inscripción; sus hermanas quedan intactas.
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
  priceId: string;
}): Promise<CobroResult> {
  return await db.transaction(async (tx) => {
    const context = await loadCobroContext(tx, input);
    if (!context.ok) {
      return context;
    }

    const { choreography, event, inscriptions } = context;

    const target = inscriptions.find(
      (inscription) => inscription.id === input.inscriptionId,
    );
    if (!target) {
      return { ok: false, message: "No encontramos esa inscripción." };
    }

    if (deriveInscriptionLadderStage(target) !== "impaga") {
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

    const referenceDate = getBusinessDateOnly();

    // Techo: el precio vigente hoy, nunca por debajo del piso (igualar lo que
    // pagó la primera hermana señada siempre es válido). No se puede señar por
    // encima de ese techo.
    const ceilingPrice = await resolveApplicablePriceRow(tx, {
      eventId: input.eventId,
      groupType: choreography.groupType,
      referenceDate,
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
      priceAmount: price.amount,
      requiredDepositPercentage: event.requiredDepositPercentage,
    });

    await tx
      .update(choreographyDancers)
      .set({
        frozenBasePriceAmount: price.amount,
        selectedPriceId: price.id,
        depositReferenceDate: referenceDate,
        depositPercentage: event.requiredDepositPercentage,
        depositAmount,
      })
      .where(eq(choreographyDancers.id, target.id));

    return await fundOwedThreshold(tx, {
      academyId: input.academyId,
      eventId: input.eventId,
      inscriptionIds: [target.id],
      threshold: "deposit",
    });
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
    (inscription) => deriveInscriptionLadderStage(inscription) === "impaga",
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
    referenceDate: getBusinessDateOnly(),
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
        priceAmount: price.amount,
        requiredDepositPercentage: event.requiredDepositPercentage,
      }),
    }))
    .sort((a, b) => a.amount - b.amount);

  return { floor, priceRows };
}

/**
 * `Pagar saldo` de una coreografía completa. Solo procede si todas las
 * inscripciones activas están `señadas`. Congela el snapshot de saldo —
 * incluyendo el `Descuento por bailarín` vivo — y asigna a cada inscripción lo
 * que adeuda contra su total, tomándolo del `Saldo disponible` de la academia.
 */
export async function payChoreographyBalance(input: {
  academyId: string;
  choreographyId: string;
  eventId: string;
}): Promise<CobroResult> {
  return await db.transaction(async (tx) => {
    const context = await loadCobroContext(tx, input);
    if (!context.ok) {
      return context;
    }

    const { inscriptions } = context;

    if (
      !inscriptions.every(
        (inscription) => deriveInscriptionLadderStage(inscription) === "señada",
      )
    ) {
      return {
        ok: false,
        message:
          "Solo se puede pagar el saldo si todas las inscripciones están señadas.",
      };
    }

    const frozen = await freezeBalanceSnapshots(tx, {
      academyId: input.academyId,
      eventId: input.eventId,
      inscriptions,
    });
    if (!frozen.ok) {
      return frozen;
    }

    return await fundOwedThreshold(tx, {
      academyId: input.academyId,
      eventId: input.eventId,
      inscriptionIds: inscriptions.map((inscription) => inscription.id),
      threshold: "total",
    });
  });
}

/**
 * Cobro extraordinario de saldo de **una sola inscripción** `señada` huérfana en
 * una coreografía mixta. A diferencia del flujo por coreografía entera, solo
 * congela el snapshot de saldo de esa inscripción; sus hermanas quedan intactas.
 *
 * Reglas que se aplican en el server:
 * - La inscripción objetivo debe estar `señada` (seña congelada, saldo
 *   pendiente).
 * - Solo procede en coreografías **mixtas** (alguna hermana en otro estado); en
 *   una coreografía 100% `señada` el primer congelamiento de saldo es el del
 *   flujo normal por coreografía entera.
 * - El `Descuento por bailarín` se calcula contra el roster vivo del bailarín,
 *   igual que la lectura.
 */
export async function payInscriptionBalance(input: {
  academyId: string;
  choreographyId: string;
  eventId: string;
  inscriptionId: string;
}): Promise<CobroResult> {
  return await db.transaction(async (tx) => {
    const context = await loadCobroContext(tx, input);
    if (!context.ok) {
      return context;
    }

    const { inscriptions } = context;

    const target = inscriptions.find(
      (inscription) => inscription.id === input.inscriptionId,
    );
    if (!target) {
      return { ok: false, message: "No encontramos esa inscripción." };
    }

    if (deriveInscriptionLadderStage(target) !== "señada") {
      return {
        ok: false,
        message: "Esta inscripción no tiene un saldo pendiente de cobro.",
      };
    }

    if (
      inscriptions.every(
        (inscription) => deriveInscriptionLadderStage(inscription) === "señada",
      )
    ) {
      return {
        ok: false,
        message:
          "El cobro de saldo por inscripción solo aplica en coreografías mixtas; usá Pagar saldo.",
      };
    }

    const frozen = await freezeBalanceSnapshots(tx, {
      academyId: input.academyId,
      eventId: input.eventId,
      inscriptions: [target],
    });
    if (!frozen.ok) {
      return frozen;
    }

    return await fundOwedThreshold(tx, {
      academyId: input.academyId,
      eventId: input.eventId,
      inscriptionIds: [target.id],
      threshold: "total",
    });
  });
}

/**
 * Congela el snapshot de saldo de las inscripciones dadas contra los mismos
 * umbrales que lee la pantalla: el total sale de `readInscriptionThresholds`, no
 * de una cuenta propia. Las columnas congeladas siguen escribiéndose porque el
 * cobro por fila todavía las lee; mueren con la escalera.
 */
async function freezeBalanceSnapshots(
  tx: Transaction,
  input: {
    academyId: string;
    eventId: string;
    inscriptions: Array<{ id: string; depositAmount: number | null }>;
  },
): Promise<CobroResult> {
  const referenceDate = getBusinessDateOnly();
  const thresholds = await readInscriptionThresholds(tx, {
    academyId: input.academyId,
    eventId: input.eventId,
    inscriptionIds: input.inscriptions.map((inscription) => inscription.id),
  });

  for (const inscription of input.inscriptions) {
    const resolution = thresholds.get(inscription.id);

    if (!resolution || resolution.totalAmount === null) {
      return {
        ok: false,
        message:
          "No hay un precio configurado para este tipo de grupo y cronograma.",
      };
    }

    const depositAmount =
      inscription.depositAmount ?? resolution.depositAmount ?? 0;

    await tx
      .update(choreographyDancers)
      .set({
        balanceReferenceDate: referenceDate,
        appliedDancerDiscountPercentage: resolution.dancerDiscountPercentage,
        appliedDancerDiscountAmount: resolution.dancerDiscountAmount,
        finalTotalAmount: resolution.totalAmount,
        balanceAmount: Math.max(0, resolution.totalAmount - depositAmount),
        balanceCompletedAt: referenceDate,
      })
      .where(eq(choreographyDancers.id, inscription.id));
  }

  return { ok: true };
}

/**
 * Corazón de las presets de cobro: asigna a cada inscripción **exactamente lo
 * que adeuda** contra el umbral pedido, sacándolo del pool de la academia. Lo
 * adeudado se computa acá, en la escritura, con el mismo dueño que la lectura,
 * así que una preset no puede sobreasignar. Una inscripción que ya cubrió el
 * umbral se saltea en vez de fallar: la preset es idempotente.
 */
async function fundOwedThreshold(
  tx: Transaction,
  input: {
    academyId: string;
    eventId: string;
    inscriptionIds: string[];
    threshold: CobroThreshold;
  },
): Promise<CobroResult> {
  const thresholds = await readInscriptionThresholds(tx, {
    academyId: input.academyId,
    eventId: input.eventId,
    inscriptionIds: input.inscriptionIds,
  });

  for (const inscriptionId of input.inscriptionIds) {
    const resolution = thresholds.get(inscriptionId);

    if (!resolution) {
      return { ok: false, message: "No encontramos esa inscripción." };
    }

    const figures = deriveInscriptionFinancialFigures({
      allocatedAmount: await readInscriptionAllocatedAmount(tx, inscriptionId),
      thresholds: resolution,
    });
    const owedAmount =
      input.threshold === "deposit"
        ? figures.owedDepositAmount
        : figures.owedBalanceAmount;

    if (owedAmount === null) {
      return {
        ok: false,
        message:
          "No hay un precio configurado para este tipo de grupo y cronograma.",
      };
    }

    if (owedAmount === 0) {
      continue;
    }

    const result = await spreadFromPool(tx, {
      academyId: input.academyId,
      amount: owedAmount,
      eventId: input.eventId,
      inscriptionId,
    });

    if (!result.ok) {
      return result;
    }
  }

  return { ok: true };
}

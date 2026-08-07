import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  choreographies,
  choreographyDancers,
  events,
  prices,
  scheduleCapacities,
} from "@/db/schema";
import { choreographyNotFoundMessage } from "@/lib/choreographies/choreography-messages";
import { resolveChoreographyPricingScheduleId } from "@/lib/finances/choreography-pricing-schedule";
import {
  deriveInscriptionLadderStage,
  type InscriptionLadderStage,
} from "@/lib/finances/inscription-ladder-snapshot";
import { selectApplicablePriceFromCandidates } from "@/lib/prices/repository.server";

export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Anything that can run a query: the connection or an open transaction. Reads
 * that participate in a cobro take this so they never open a second connection.
 */
export type Executor = Transaction | typeof db;

export type FinancePriceRow = typeof prices.$inferSelect;

export type InscriptionRow = typeof choreographyDancers.$inferSelect;

/**
 * Resultado de una operación de cobro. Cuando `ok` es `false`, `message` es un
 * texto listo para mostrar en la UI administrativa.
 */
export type CobroResult = { ok: true } | { ok: false; message: string };

/**
 * A refusal raised from inside a cobro transaction. Returning `{ ok: false }`
 * from a Drizzle transaction callback **commits**, so a write that refuses
 * halfway — the pool running dry on the third inscription — would leave the
 * earlier ones funded. Throwing rolls back; `runCobro` turns it back into the
 * `CobroResult` the caller expects.
 */
class CobroRefusal extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "CobroRefusal";
  }
}

/**
 * Runs a money change inside a transaction where **any** refusal rolls back.
 * Every one of them is all-or-nothing: an administrator who sees an error has
 * to be able to trust that nothing moved.
 */
export async function runCobro(
  run: (tx: Transaction) => Promise<CobroResult>,
): Promise<CobroResult> {
  try {
    return await db.transaction(async (tx) => {
      const result = await run(tx);

      if (!result.ok) {
        throw new CobroRefusal(result.message);
      }

      return result;
    });
  } catch (thrown) {
    if (thrown instanceof CobroRefusal) {
      return { ok: false, message: thrown.reason };
    }

    throw thrown;
  }
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
    };

export async function loadCobroContext(
  tx: Transaction,
  input: {
    academyId: string;
    choreographyId: string;
    eventId: string;
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
    return { ok: false, message: choreographyNotFoundMessage };
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

  return {
    ok: true,
    choreography: {
      groupType: choreographyRow.groupType,
      scheduleId: resolveChoreographyPricingScheduleId(choreographyRow),
    },
    event,
    inscriptions,
  };
}

/**
 * Selecciona la fila de precio vigente para un tipo de grupo y cronograma contra
 * `referenceDate`, priorizando el precio específico del cronograma sobre el
 * general. Consulta con la transacción activa para no abrir una conexión nueva.
 */
export async function resolveApplicablePriceRow(
  tx: Transaction,
  input: {
    eventId: string;
    groupType: string;
    referenceDate: string;
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
    referenceDate: input.referenceDate,
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

/**
 * Etapas de snapshot de las inscripciones de una coreografía, para las acciones
 * `Pagar seña` / `Pagar saldo`. Es lo único que todavía lee la escalera: el
 * estado financiero que la aplicación muestra sale del dinero, no de acá.
 */
export async function readChoreographyLadderStages(
  choreographyId: string,
): Promise<Map<string, InscriptionLadderStage>> {
  const rows = await db
    .select({
      balanceReferenceDate: choreographyDancers.balanceReferenceDate,
      depositReferenceDate: choreographyDancers.depositReferenceDate,
      id: choreographyDancers.id,
    })
    .from(choreographyDancers)
    .where(eq(choreographyDancers.choreographyId, choreographyId));

  return new Map(
    rows.map((row) => [row.id, deriveInscriptionLadderStage(row)]),
  );
}

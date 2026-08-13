import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  choreographies,
  events,
  prices,
  scheduleCapacities,
} from "@/db/schema";
import {
  calculateDepositAmount,
  hasCrossedDepositThreshold,
} from "@/lib/finances/inscription-financial-status";

export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Anything that can run a query: the connection or an open transaction. Reads
 * that participate in a cobro take this so they never open a second connection.
 */
export type Executor = Transaction | typeof db;

type FinancePriceRow = typeof prices.$inferSelect;

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
 * Whether an inscription has crossed the deposit threshold of the price row it
 * **stores** — the one question the price lock turns on, and the single owner of
 * it on the write side.
 *
 * Reading the stored row here rather than through `readInscriptionThresholds`
 * is deliberate: that reader resolves the *effective* price, which below the
 * threshold is the row that applies today, and asking whether today's row's
 * threshold was crossed is the circularity this rule exists to avoid. With no
 * stored row there is no threshold, so nothing is locked.
 */
export async function hasCrossedStoredDepositThreshold(
  executor: Executor,
  input: { allocatedAmount: number; selectedPriceId: string | null },
): Promise<boolean> {
  if (input.selectedPriceId === null) {
    return false;
  }

  const [stored] = await executor
    .select({
      priceAmount: prices.amount,
      requiredDepositPercentage: events.requiredDepositPercentage,
    })
    .from(prices)
    .innerJoin(events, eq(prices.eventId, events.id))
    .where(eq(prices.id, input.selectedPriceId))
    .limit(1);

  if (!stored) {
    return false;
  }

  return hasCrossedDepositThreshold({
    allocatedAmount: input.allocatedAmount,
    depositAmount: calculateDepositAmount(stored),
  });
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

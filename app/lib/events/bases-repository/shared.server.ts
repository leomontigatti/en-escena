import { and, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { choreographies } from "@/db/schema";
import { notWithdrawnChoreography } from "@/lib/choreographies/withdrawn-choreography";

export type EventBasesTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

/**
 * Either connection a bases query can run on: the pool for the reads that
 * stand alone, the open transaction for the ones whose answer has to be that
 * transaction's.
 */
export type EventBasesExecutor = EventBasesTransaction | typeof db;

export function normalizeNullableName(name: string) {
  const trimmedName = name.trim();

  return trimmedName.length > 0 ? trimmedName : null;
}

export function uniqueValues(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

/**
 * Whether a choreography matching `filter` still occupies the base the caller
 * is about to edit. Every `Bases del evento` guard asks this one question, so
 * the rule that answers it lives here only.
 *
 * A choreography occupies its bases while it is not withdrawn — the same single
 * rule the schedule occupancy counts apply. A withdrawn choreography preserves
 * evidence rather than a path: it will not be performed, so it holds nothing
 * still and does not block editing the bases it points at.
 */
export async function hasOccupyingChoreographies(
  filter: SQL | undefined,
  executor: EventBasesExecutor = db,
) {
  const [choreography] = await executor
    .select({ id: choreographies.id })
    .from(choreographies)
    .where(and(filter, notWithdrawnChoreography()))
    .limit(1);

  return Boolean(choreography);
}

/**
 * Whether any choreography at all matches `filter`, occupying or not. The
 * delete guards ask this instead of `hasOccupyingChoreographies`: none of these
 * foreign keys carries an `on delete` behaviour, so the database refuses to
 * drop a base under a choreography whose inscriptions were all withdrawn too.
 * Reporting that refusal as a typed failure is what the guard adds — asking the
 * narrower question would let the raw driver error through.
 *
 * The category guards ask it for their edits as well: a withdrawn inscription
 * preserves the category and the registration path the choreography competed
 * on, so neither may move underneath it.
 */
export async function hasReferencingChoreographies(filter: SQL | undefined) {
  const [choreography] = await db
    .select({ id: choreographies.id })
    .from(choreographies)
    .where(filter)
    .limit(1);

  return Boolean(choreography);
}

import { and, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { choreographies } from "@/db/schema";
import { notWithdrawnChoreography } from "@/lib/choreographies/withdrawn-choreography";
import type { EventBasesExecutor } from "@/lib/events/bases-kernel.server";

/**
 * Whether a choreography matching `filter` still occupies the schedule or the
 * schedule capacity the caller is about to edit. Both schedule guards ask this
 * one question, so the rule that answers it lives here only.
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

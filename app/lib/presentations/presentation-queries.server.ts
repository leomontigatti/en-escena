import { eq } from "drizzle-orm";

import { db } from "@/db";
import { presentations } from "@/db/schema";
import type { Executor } from "@/lib/finances/choreography-cobro-support.server";

/**
 * The number a choreography presents with, or `null` when it has none yet. It
 * is not a lock — see evaluation-lock.server.ts — only the thing the detail
 * names when it warns that a correction may need attention on the
 * participation list, and what the delete dialog says will leave a gap.
 */
export async function findPresentationOrderNumber(
  choreographyId: string,
): Promise<number | null> {
  const presentation = await db.query.presentations.findFirst({
    columns: { orderNumber: true },
    where: eq(presentations.choreographyId, choreographyId),
  });

  return presentation?.orderNumber ?? null;
}

/**
 * Takes a choreography out of the order. The gap it leaves is deliberate: the
 * remaining numbers are what the academies were told, so nothing is renumbered
 * behind their back. Closing the gap is the administrator's move on the
 * participation list.
 *
 * Takes the executor because deleting a choreography deletes its presentation
 * in the same transaction: there is no cascade, matching every other reference
 * to a choreography.
 */
export async function deleteChoreographyPresentation(
  executor: Executor,
  choreographyId: string,
): Promise<void> {
  await executor
    .delete(presentations)
    .where(eq(presentations.choreographyId, choreographyId));
}

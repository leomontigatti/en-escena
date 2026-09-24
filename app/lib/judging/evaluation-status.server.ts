import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { judgeAssignments, presentations, scores } from "@/db/schema";
import type { Executor } from "@/lib/finances/choreography-cobro-support.server";

/**
 * Where a presentation stands for the panel, in the values
 * `Estado de participación` already has. `disqualified` is disqualified,
 * `evaluated` is evaluated and not disqualified, and `pending` is everything
 * else — including a choreography that has no presentation at all.
 *
 * "Evaluated" is the same fact `evaluation-lock.server.ts` locks on: any score
 * row exists, or the presentation is disqualified. This module splits that one
 * answer in two because the administrative list shows the two apart.
 */
export type PresentationEvaluationStatus =
  "disqualified" | "evaluated" | "pending";

/**
 * The status of many choreographies at once, keyed by choreography. Only the
 * ones that are not `pending` are in the map: a reader that finds nothing
 * reads `pending`, which is what a choreography without a presentation is.
 *
 * It takes the executor for the reason `evaluation-lock.server.ts` does: a
 * caller inside a transaction must read inside it too.
 */
export async function readPresentationEvaluationStatuses(
  choreographyIds: string[],
  executor: Executor = db,
): Promise<Map<string, PresentationEvaluationStatus>> {
  if (choreographyIds.length === 0) {
    return new Map();
  }

  // One left join rather than two queries, and one row per assignment: the
  // fold below collapses them, so a presentation with three judges answers the
  // same as one with a single score.
  const rows = await executor
    .select({
      choreographyId: presentations.choreographyId,
      disqualifiedAt: presentations.disqualifiedAt,
      scoreId: scores.id,
    })
    .from(presentations)
    .leftJoin(
      judgeAssignments,
      eq(judgeAssignments.presentationId, presentations.id),
    )
    .leftJoin(scores, eq(scores.judgeAssignmentId, judgeAssignments.id))
    .where(and(inArray(presentations.choreographyId, choreographyIds)));

  const statuses = new Map<string, PresentationEvaluationStatus>();

  for (const row of rows) {
    if (row.disqualifiedAt !== null) {
      statuses.set(row.choreographyId, "disqualified");
      continue;
    }

    // A disqualification outranks a score, and the rows of one presentation
    // arrive in no particular order, so a score never overwrites it.
    if (row.scoreId !== null && !statuses.has(row.choreographyId)) {
      statuses.set(row.choreographyId, "evaluated");
    }
  }

  return statuses;
}

import { and, eq, inArray, isNotNull, or } from "drizzle-orm";

import { db } from "@/db";
import { judgeAssignments, presentations, scores } from "@/db/schema";
import type { Executor } from "@/lib/finances/choreography-cobro-support.server";

/**
 * Whether a choreography's presentation has already been evaluated, which is
 * the one condition that closes a choreography for correction. It replaces the
 * old "has a presentation" lock: a number is only a place in the order and can
 * be moved, so it locks nothing; what cannot be undone is a judge having
 * scored the presentation. See docs/domain/judging.md, "Participation And
 * Judging", and docs/domain/choreographies.md, "Choreography Locks".
 *
 * **Evaluated** means the presentation is disqualified, or any judge has saved
 * a score for it. A score row is written on a judge's first save and never on
 * assignment, so its existence is the fact; a disqualification counts too,
 * because the panel has judged the presentation even though no number came of
 * it, and reinstating it brings back the scores that were there.
 *
 * Both take the executor for the same reason: a caller that holds a row lock
 * asks this question inside its own transaction, and must read there too.
 * Reading through `db` from inside a `FOR UPDATE` transaction would answer from
 * outside the lock, so the lock would not cover the evaluation it was taken to
 * protect.
 */
export async function hasEvaluatedPresentation(
  choreographyId: string,
  executor: Executor = db,
): Promise<boolean> {
  const evaluated = await findEvaluatedChoreographyIds(
    [choreographyId],
    executor,
  );

  return evaluated.has(choreographyId);
}

/**
 * The bulk form, for readers that hold many choreographies at once — the
 * birth-date correction sweeps every choreography a dancer belongs to — and
 * must not ask the seam once per row.
 */
export async function findEvaluatedChoreographyIds(
  choreographyIds: string[],
  executor: Executor = db,
): Promise<Set<string>> {
  if (choreographyIds.length === 0) {
    return new Set();
  }

  // One left join rather than two queries: the two halves of "evaluated" live
  // on different tables, and a presentation with several judges would otherwise
  // be counted once per assignment.
  const rows = await executor
    .selectDistinct({ choreographyId: presentations.choreographyId })
    .from(presentations)
    .leftJoin(
      judgeAssignments,
      eq(judgeAssignments.presentationId, presentations.id),
    )
    .leftJoin(scores, eq(scores.judgeAssignmentId, judgeAssignments.id))
    .where(
      and(
        inArray(presentations.choreographyId, choreographyIds),
        or(isNotNull(presentations.disqualifiedAt), isNotNull(scores.id)),
      ),
    );

  return new Set(rows.map((row) => row.choreographyId));
}

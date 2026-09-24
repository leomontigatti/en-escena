import {
  and,
  eq,
  exists,
  inArray,
  isNotNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

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

  // Distinct on purpose: a choreography can hold a presentation in more than
  // one event, and the answer is about the choreography.
  const rows = await executor
    .selectDistinct({ choreographyId: presentations.choreographyId })
    .from(presentations)
    .where(
      and(
        inArray(presentations.choreographyId, choreographyIds),
        isPresentationEvaluated(),
      ),
    );

  return new Set(rows.map((row) => row.choreographyId));
}

/**
 * The same fact as a SQL condition over `presentations`, for a reader that has
 * the rows in hand rather than a list of choreography ids — publishing an
 * event's results stamps every evaluated presentation in one `UPDATE`, and must
 * not restate the predicate to do it. This module owns the definition; see
 * `publishResults` in `app/lib/judging/results.server.ts`.
 *
 * The score half is an `EXISTS` rather than a join so the condition can be
 * dropped into any statement that already has `presentations` in scope, an
 * `UPDATE` among them, without changing what that statement returns or locks.
 */
export function isPresentationEvaluated(): SQL | undefined {
  return or(
    isNotNull(presentations.disqualifiedAt),
    exists(
      db
        .select({ one: sql`1` })
        .from(judgeAssignments)
        .innerJoin(scores, eq(scores.judgeAssignmentId, judgeAssignments.id))
        .where(eq(judgeAssignments.presentationId, presentations.id)),
    ),
  );
}

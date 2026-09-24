import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";

import { db } from "@/db";
import { judgeAssignments, presentations, scores, user } from "@/db/schema";
import type { Executor } from "@/lib/finances/choreography-cobro-support.server";

/**
 * Who judges which presentation. The pair is all there is: assigning creates
 * the assignment and nothing else — no score row, which belongs to the judging
 * effort — and removing goes through the one function below, so that effort has
 * a single place to add its guard. See docs/domain/judging.md, "Participation
 * And Judging".
 */

export type AssignableJudge = {
  id: string;
  name: string;
};

export type JudgeAssignmentResult = {
  judgeCount: number;
  presentationCount: number;
};

/**
 * What a removal answers. "Kept" has no meaning for an assignment — nothing
 * refuses one — so only this half of the seam carries the count.
 */
export type JudgeRemovalResult = JudgeAssignmentResult & {
  keptCount: number;
};

/**
 * Every judge who can be put on a presentation: the role, globally, minus the
 * suspended. There is no per-event membership — a judge is a judge of the
 * organisation — and no load count, so the list is the same for every row.
 */
export async function readAssignableJudges(
  executor: Executor = db,
): Promise<AssignableJudge[]> {
  return await executor
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(and(eq(user.role, "judge"), eq(user.suspended, false)))
    .orderBy(asc(user.name));
}

export type AssignedJudges = {
  /** The judges of each choreography that has any, keyed by choreography. */
  byChoreography: Map<string, string[]>;
  /** Everyone assigned to at least one of them, named, in reading order. */
  judges: AssignableJudge[];
};

/**
 * The judges already on the given choreographies. It is what the removal
 * dialog narrows its options to: only a judge somebody in the selection
 * actually has is worth offering to remove. A judge who has since been
 * suspended or changed role is still named here — they are still on the
 * presentation, and taking them off is exactly what the dialog is for.
 */
export async function readAssignedJudges(
  choreographyIds: string[],
  executor: Executor = db,
): Promise<AssignedJudges> {
  const byChoreography = new Map<string, string[]>();

  if (choreographyIds.length === 0) {
    return { byChoreography, judges: [] };
  }

  const rows = await executor
    .select({
      choreographyId: presentations.choreographyId,
      name: user.name,
      userId: judgeAssignments.userId,
    })
    .from(judgeAssignments)
    .innerJoin(
      presentations,
      eq(judgeAssignments.presentationId, presentations.id),
    )
    .innerJoin(user, eq(judgeAssignments.userId, user.id))
    .where(inArray(presentations.choreographyId, choreographyIds))
    .orderBy(asc(user.name));

  const judgesById = new Map<string, AssignableJudge>();

  for (const row of rows) {
    const bucket = byChoreography.get(row.choreographyId) ?? [];
    bucket.push(row.userId);
    byChoreography.set(row.choreographyId, bucket);
    judgesById.set(row.userId, { id: row.userId, name: row.name });
  }

  return { byChoreography, judges: [...judgesById.values()] };
}

/**
 * Puts every chosen judge on every chosen presentation. A pair that already
 * exists is skipped without a word: the administrator asked for a state, not
 * for an insertion, and re-running the dialog over an overlapping selection is
 * the normal way to widen one.
 *
 * Only an assignable judge is written, so an id that went suspended or changed
 * role between the dialog opening and the confirmation is dropped rather than
 * refused. The counts answer for what was actually reached.
 */
export async function assignJudges(input: {
  choreographyIds: string[];
  judgeIds: string[];
}): Promise<JudgeAssignmentResult> {
  return await db.transaction(async (tx) => {
    const assignable = await readAssignableJudges(tx);
    const judgeIds = assignable
      .map((judge) => judge.id)
      .filter((id) => input.judgeIds.includes(id));
    const presentationIds = await findPresentationIds(
      tx,
      input.choreographyIds,
    );

    if (judgeIds.length === 0 || presentationIds.length === 0) {
      return { judgeCount: 0, presentationCount: 0 };
    }

    await tx
      .insert(judgeAssignments)
      .values(
        presentationIds.flatMap((presentationId) =>
          judgeIds.map((userId) => ({ presentationId, userId })),
        ),
      )
      .onConflictDoNothing();

    return {
      judgeCount: judgeIds.length,
      presentationCount: presentationIds.length,
    };
  });
}

/**
 * Takes every chosen judge off every chosen presentation that has them. It is
 * the single removal seam, and it carries the judging guard: a pair whose judge
 * has already saved a score is kept, because removing the assignment would
 * orphan the score the whole panel's average is built from.
 *
 * A bulk removal does not fail on one such pair. It removes everything else and
 * answers with how many it kept, so the administrator learns what was left
 * behind in the same notification as the success — and a single removal, which
 * is a selection of one, comes back having removed nothing, which is the
 * refusal.
 */
export async function removeJudges(input: {
  choreographyIds: string[];
  judgeIds: string[];
}): Promise<JudgeRemovalResult> {
  return await db.transaction(async (tx) => {
    const presentationIds = await findPresentationIds(
      tx,
      input.choreographyIds,
    );

    if (input.judgeIds.length === 0 || presentationIds.length === 0) {
      return { judgeCount: 0, keptCount: 0, presentationCount: 0 };
    }

    // The chosen pairs, each told apart by whether its judge has saved a score.
    // The score is read here rather than left to the foreign key's `restrict`,
    // so one scored pair refuses itself instead of failing the whole removal.
    //
    // The assignments are locked as they are read, because that reading is what
    // the delete then trusts. A judge saving a score mid-removal takes a key
    // share of their assignment row through the score's foreign key, which this
    // lock waits for: without it the score would land between the read and the
    // delete, and `restrict` would raise and take down the removal of every
    // other pair with it — the one outcome this seam exists to avoid.
    const chosen = await tx
      .select({
        id: judgeAssignments.id,
        scored: isNotNull(scores.id),
      })
      .from(judgeAssignments)
      .leftJoin(scores, eq(scores.judgeAssignmentId, judgeAssignments.id))
      .where(
        and(
          inArray(judgeAssignments.presentationId, presentationIds),
          inArray(judgeAssignments.userId, input.judgeIds),
        ),
      )
      .for("update", { of: judgeAssignments });

    const removableIds = chosen
      .filter((row) => !row.scored)
      .map((row) => row.id);
    const keptCount = chosen.length - removableIds.length;

    if (removableIds.length === 0) {
      return { judgeCount: 0, keptCount, presentationCount: 0 };
    }

    const removed = await tx
      .delete(judgeAssignments)
      .where(inArray(judgeAssignments.id, removableIds))
      .returning({
        presentationId: judgeAssignments.presentationId,
        userId: judgeAssignments.userId,
      });

    return {
      judgeCount: new Set(removed.map((row) => row.userId)).size,
      keptCount,
      presentationCount: new Set(removed.map((row) => row.presentationId)).size,
    };
  });
}

/**
 * Deletes what hangs off a choreography's presentation, before the presentation
 * itself goes. There is no cascade anywhere in this schema, so a delete says
 * what it takes with it.
 */
export async function deleteChoreographyJudgeAssignments(
  executor: Executor,
  choreographyId: string,
): Promise<void> {
  const presentationIds = await findPresentationIds(executor, [choreographyId]);

  if (presentationIds.length === 0) {
    return;
  }

  await executor
    .delete(judgeAssignments)
    .where(inArray(judgeAssignments.presentationId, presentationIds));
}

/** The presentations of the given choreographies; the unnumbered have none. */
async function findPresentationIds(
  executor: Executor,
  choreographyIds: string[],
) {
  if (choreographyIds.length === 0) {
    return [];
  }

  const rows = await executor
    .select({ id: presentations.id })
    .from(presentations)
    .where(inArray(presentations.choreographyId, choreographyIds));

  return rows.map((row) => row.id);
}

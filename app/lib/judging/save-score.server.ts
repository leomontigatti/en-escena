import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  choreographies,
  judgeAssignments,
  presentations,
  schedules,
  scores,
} from "@/db/schema";
import { isOpenForJudges } from "@/lib/judging/judging-day";
import {
  formatScoreValue,
  parseScoreValue,
  singleScoreMaximum,
} from "@/lib/judging/score-value";

/**
 * A judge's own save of a single 0-100 score. See docs/domain/judging.md,
 * "Scores And Feedback".
 *
 * Everything the save is allowed to depend on is read inside the transaction,
 * under a `FOR UPDATE` on the presentation: a judge mid-dialog while the panel
 * moves around them must not have their write decided by what the page was
 * rendered with. The write itself is an upsert on the assignment, so the row a
 * retry finds is the row it updates and a doubled tap never yields two scores.
 */

export type SaveJudgeScoreRefusal = "not-assigned" | "closed" | "invalid-value";

export type SaveJudgeScoreResult =
  { ok: true } | { ok: false; reason: SaveJudgeScoreRefusal };

export type SaveJudgeScoreInput = {
  judgeId: string;
  now?: Date;
  presentationId: string;
  value: string;
};

export async function saveJudgeScore(
  input: SaveJudgeScoreInput,
): Promise<SaveJudgeScoreResult> {
  const value = parseScoreValue(input.value, singleScoreMaximum);

  if (value === null) {
    return { ok: false, reason: "invalid-value" };
  }

  return await db.transaction(async (tx) => {
    const [locked] = await tx
      .select({ id: presentations.id })
      .from(presentations)
      .where(eq(presentations.id, input.presentationId))
      .for("update");

    if (!locked) {
      return { ok: false, reason: "not-assigned" };
    }

    const [assignment] = await tx
      .select({ id: judgeAssignments.id })
      .from(judgeAssignments)
      .where(
        and(
          eq(judgeAssignments.presentationId, input.presentationId),
          eq(judgeAssignments.userId, input.judgeId),
        ),
      );

    if (!assignment) {
      return { ok: false, reason: "not-assigned" };
    }

    if (!(await isPresentationOpenForJudges(tx, input))) {
      return { ok: false, reason: "closed" };
    }

    await tx
      .insert(scores)
      .values({
        judgeAssignmentId: assignment.id,
        value: formatScoreValue(value),
      })
      .onConflictDoUpdate({
        target: scores.judgeAssignmentId,
        set: { updatedAt: new Date(), value: formatScoreValue(value) },
      });

    return { ok: true };
  });
}

/**
 * A presentation whose choreography has no schedule yet has no day to be open
 * on, so it is closed: the judges are given the program before they are given
 * anything to score.
 */
async function isPresentationOpenForJudges(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: Pick<SaveJudgeScoreInput, "now" | "presentationId">,
): Promise<boolean> {
  const [row] = await tx
    .select({ scheduledDate: schedules.scheduledDate })
    .from(presentations)
    .innerJoin(
      choreographies,
      eq(choreographies.id, presentations.choreographyId),
    )
    .innerJoin(schedules, eq(schedules.id, choreographies.scheduleId))
    .where(eq(presentations.id, input.presentationId));

  return Boolean(row) && isOpenForJudges(row.scheduledDate, input.now);
}

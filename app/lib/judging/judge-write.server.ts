import { and, eq } from "drizzle-orm";

import type { db } from "@/db";
import {
  choreographies,
  judgeAssignments,
  presentations,
  schedules,
  scores,
} from "@/db/schema";
import { isOpenForJudges } from "@/lib/judging/judging-day";

/**
 * What every write a judge makes has to establish first: that the presentation
 * is theirs to write on, that its day is still open, and how it stands right
 * now. It is read under a `FOR UPDATE` on the presentation so that a panel
 * moving around a judge mid-dialog — a colleague disqualifying, the day turning
 * — decides the write, rather than whatever the page was rendered with.
 *
 * The two refusals are different in kind and stay apart: writing on a
 * presentation one is not assigned to is not a mistake the interface can make,
 * while a day that closed mid-show is an ordinary thing to run into.
 */

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type JudgeWriteRefusal = "not-assigned" | "closed";

export type JudgeWriteTarget = {
  disqualified: boolean;
  eventId: string;
  /** The judge's stored take, or null when they have saved none. */
  feedbackAudioStorageKey: string | null;
  /** Whether the judge already has a score row, which a null take cannot tell apart. */
  hasScore: boolean;
  judgeAssignmentId: string;
};

export type JudgeWriteTargetResolution =
  | { ok: false; reason: JudgeWriteRefusal }
  | { ok: true; target: JudgeWriteTarget };

export async function readJudgeWriteTarget(
  tx: Transaction,
  input: { judgeId: string; now?: Date; presentationId: string },
): Promise<JudgeWriteTargetResolution> {
  const [locked] = await tx
    .select({
      disqualifiedAt: presentations.disqualifiedAt,
      eventId: presentations.eventId,
    })
    .from(presentations)
    .where(eq(presentations.id, input.presentationId))
    .for("update");

  if (!locked) {
    return { ok: false, reason: "not-assigned" };
  }

  const [assignment] = await tx
    .select({
      feedbackAudioStorageKey: scores.feedbackAudioStorageKey,
      id: judgeAssignments.id,
      scoreId: scores.id,
    })
    .from(judgeAssignments)
    .leftJoin(scores, eq(scores.judgeAssignmentId, judgeAssignments.id))
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

  return {
    ok: true,
    target: {
      disqualified: locked.disqualifiedAt !== null,
      eventId: locked.eventId,
      feedbackAudioStorageKey: assignment.feedbackAudioStorageKey,
      hasScore: assignment.scoreId !== null,
      judgeAssignmentId: assignment.id,
    },
  };
}

/**
 * A presentation whose choreography has no schedule yet has no day to be open
 * on, so it is closed: the judges are given the program before they are given
 * anything to score.
 */
async function isPresentationOpenForJudges(
  tx: Transaction,
  input: { now?: Date; presentationId: string },
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

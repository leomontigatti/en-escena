import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  categories,
  choreographies,
  judgeAssignments,
  modalities,
  presentations,
  schedules,
  scores,
  submodalities,
} from "@/db/schema";
import type { Executor } from "@/lib/finances/choreography-cobro-support.server";
import {
  deriveJudgeScoreStatus,
  type JudgeScoreStatus,
} from "@/lib/judging/judge-status";
import { readSheetValuesByScore } from "@/lib/judging/sheet-values.server";
import type { SheetCriterion } from "@/lib/judging/sheet-total";
import {
  readCriteriaBySubmodality,
  sheetForLevel,
} from "@/lib/judging/submodality-criteria.server";
import type { ChoreographyGroupType } from "@/lib/portal/choreographies";
import {
  type FeedbackAudioStorage,
  createDefaultFeedbackAudioStorage,
  loadFeedbackAudioDownloadUrl,
} from "@/lib/storage/feedback-audio.server";

/**
 * What a judge sees on their list: the presentations assigned to them on one
 * day, in the order the show runs them. Which day, and whether it is open for
 * writing, is the caller's: this module reads any of the judge's days alike,
 * and the write window is enforced on every write, not here. See
 * docs/domain/judging.md, "Scores And Feedback".
 *
 * The row carries what the judge needs to recognise the dance on stage — the
 * academy is as public as the program that prints it — and none of the other
 * judges' work, so that the list cannot leak what the panel is not supposed to
 * compare notes on.
 *
 * The judge's own score does come back, because correcting it is the one thing
 * a judge does more than once: reopening a scored presentation has to show the
 * number they gave, or a correction is a blind retype and re-recording a
 * `Devolución` means entering a score again from memory. The list shows the
 * number in place of the status word (see `judgeScoreStatusBadge`), and it is
 * the judge's own score and no one else's.
 */

/** One line of the sheet, exactly as the total and the validation read it. */
export type JudgeSheetCriterion = SheetCriterion;

export type JudgePresentationRow = {
  academyName: string;
  /** Empty when the submodality is scored with a single 0-100 value. */
  criteria: JudgeSheetCriterion[];
  /**
   * The judge's own sheet as they saved it, keyed by criterion and as the
   * numeric column reads it; empty when they have saved none of it.
   */
  criteriaValues: Record<string, string>;
  categoryAdmitsExperienceLevels: boolean;
  categoryName: string;
  experienceLevel: string | null;
  /** The judge's own take, signed for playback; null when there is none. */
  feedbackAudioUrl: string | null;
  groupType: ChoreographyGroupType;
  judgeAssignmentId: string;
  modalityName: string;
  name: string;
  orderNumber: number;
  presentationId: string;
  status: JudgeScoreStatus;
  submodalityName: string | null;
  /**
   * The judge's own score, as the numeric column reads it, or null when they
   * have not saved one. It is what their form starts from, and what the status
   * shows once the score is complete.
   */
  value: string | null;
};

export async function readJudgePresentations(
  input: {
    judgeId: string;
    /** The schedule date to read, as a `YYYY-MM-DD` business date. */
    scheduledDate: string;
    storage?: FeedbackAudioStorage;
  },
  executor: Executor = db,
): Promise<JudgePresentationRow[]> {
  const rows = await executor
    .select({
      academyName: academies.name,
      categoryExperienceLevels: categories.experienceLevels,
      categoryName: categories.name,
      disqualifiedAt: presentations.disqualifiedAt,
      experienceLevel: choreographies.experienceLevelId,
      feedbackAudioStorageKey: scores.feedbackAudioStorageKey,
      groupType: choreographies.groupType,
      judgeAssignmentId: judgeAssignments.id,
      modalityName: modalities.name,
      name: choreographies.name,
      orderNumber: presentations.orderNumber,
      presentationId: presentations.id,
      scoreId: scores.id,
      scoreValue: scores.value,
      submodalityId: choreographies.submodalityId,
      submodalityName: submodalities.name,
    })
    .from(judgeAssignments)
    .innerJoin(
      presentations,
      eq(presentations.id, judgeAssignments.presentationId),
    )
    .innerJoin(
      choreographies,
      eq(choreographies.id, presentations.choreographyId),
    )
    .innerJoin(academies, eq(academies.id, choreographies.academyId))
    .innerJoin(categories, eq(categories.id, choreographies.categoryId))
    .innerJoin(modalities, eq(modalities.id, choreographies.modalityId))
    .innerJoin(schedules, eq(schedules.id, choreographies.scheduleId))
    .leftJoin(submodalities, eq(submodalities.id, choreographies.submodalityId))
    .leftJoin(scores, eq(scores.judgeAssignmentId, judgeAssignments.id))
    .where(
      and(
        eq(judgeAssignments.userId, input.judgeId),
        eq(schedules.scheduledDate, input.scheduledDate),
      ),
    )
    .orderBy(asc(presentations.orderNumber));

  const [criteriaBySubmodality, sheetsByScore] = await Promise.all([
    readCriteriaBySubmodality(
      executor,
      rows.map((row) => row.submodalityId),
    ),
    readSheetValuesByScore(
      executor,
      rows.map((row) => row.scoreId),
    ),
  ]);

  // Built once for the whole list, and only when a take is actually stored: a
  // judge who has recorded nothing must not need the storage env to see their
  // list at all.
  const storage = rows.some((row) => row.feedbackAudioStorageKey)
    ? (input.storage ?? createDefaultFeedbackAudioStorage())
    : null;

  return await Promise.all(
    rows.map(async (row) => ({
      academyName: row.academyName,
      categoryAdmitsExperienceLevels: row.categoryExperienceLevels.length > 0,
      categoryName: row.categoryName,
      criteria: row.submodalityId
        ? sheetForLevel(
            criteriaBySubmodality.get(row.submodalityId) ?? [],
            row.experienceLevel,
          )
        : [],
      criteriaValues: (row.scoreId && sheetsByScore.get(row.scoreId)) || {},
      experienceLevel: row.experienceLevel,
      feedbackAudioUrl: storage
        ? await loadFeedbackAudioDownloadUrl({
            storage,
            storageKey: row.feedbackAudioStorageKey,
          })
        : null,
      groupType: row.groupType as ChoreographyGroupType,
      judgeAssignmentId: row.judgeAssignmentId,
      modalityName: row.modalityName,
      name: row.name,
      orderNumber: row.orderNumber,
      presentationId: row.presentationId,
      status: deriveJudgeScoreStatus({
        disqualified: row.disqualifiedAt !== null,
        hasFeedbackAudio: row.feedbackAudioStorageKey !== null,
        value: row.scoreValue,
      }),
      submodalityName: row.submodalityName,
      value: row.scoreValue,
    })),
  );
}

/**
 * The schedule dates on which the judge has at least one assigned
 * presentation, each once and in date order: the days their list can show.
 */
export async function readJudgeAssignedDays(
  input: { judgeId: string },
  executor: Executor = db,
): Promise<string[]> {
  const rows = await executor
    .selectDistinct({ scheduledDate: schedules.scheduledDate })
    .from(judgeAssignments)
    .innerJoin(
      presentations,
      eq(presentations.id, judgeAssignments.presentationId),
    )
    .innerJoin(
      choreographies,
      eq(choreographies.id, presentations.choreographyId),
    )
    .innerJoin(schedules, eq(schedules.id, choreographies.scheduleId))
    .where(eq(judgeAssignments.userId, input.judgeId))
    .orderBy(asc(schedules.scheduledDate));

  return rows.map((row) => row.scheduledDate);
}

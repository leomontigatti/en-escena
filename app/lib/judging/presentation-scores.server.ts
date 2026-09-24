import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  categories,
  choreographies,
  judgeAssignments,
  modalities,
  presentations,
  scores,
  submodalities,
  user,
} from "@/db/schema";
import type { Executor } from "@/lib/finances/choreography-cobro-support.server";
import type { JudgeSheetCriterion } from "@/lib/judging/judge-list.server";
import { readSheetValuesByScore } from "@/lib/judging/sheet-values.server";
import { readSubmodalityCriteria } from "@/lib/judging/submodality-criteria.server";
import {
  medalForAverage,
  presentationAverage,
  type Medal,
} from "@/lib/judging/medal";
import {
  type FeedbackAudioStorage,
  createDefaultFeedbackAudioStorage,
  loadFeedbackAudioDownloadUrl,
} from "@/lib/storage/feedback-audio.server";

/**
 * What one presentation's whole panel did, which only administration and the
 * auditor ever see. A judge's own list deliberately hides every other judge's
 * work (`judge-list.server.ts`); this is the one read that puts it side by
 * side. See docs/domain/judging.md, "Scores And Feedback".
 *
 * A judge with no score row is still a row here, read as "Sin puntaje": the
 * panel is its assignments, so a judge who has not saved yet is a gap to see
 * rather than a name that disappears.
 */

export type PresentationJudgeScore = {
  annulled: boolean;
  /** The judge's sheet by criterion; empty when the submodality has no criteria. */
  criteriaValues: Record<string, string>;
  feedbackAudioUrl: string | null;
  judgeAssignmentId: string;
  judgeId: string;
  judgeName: string;
  scoreId: string | null;
  /** The saved score, as the numeric column reads it, or null for "Sin puntaje". */
  value: string | null;
};

export type PresentationScoresView = {
  academyName: string;
  /** Null for a disqualified presentation and when nothing counts. */
  average: number | null;
  categoryName: string;
  choreographyId: string;
  /** Empty when the submodality is scored with a single 0-100 value. */
  criteria: JudgeSheetCriterion[];
  disqualified: boolean;
  experienceLevel: string | null;
  judges: PresentationJudgeScore[];
  medal: Medal | null;
  modalityName: string;
  name: string;
  orderNumber: number;
  presentationId: string;
  submodalityName: string | null;
};

export async function readPresentationScores(
  input: {
    presentationId: string;
    storage?: FeedbackAudioStorage;
  },
  executor: Executor = db,
): Promise<PresentationScoresView | null> {
  const [presentation] = await executor
    .select({
      academyName: academies.name,
      categoryName: categories.name,
      choreographyId: choreographies.id,
      disqualifiedAt: presentations.disqualifiedAt,
      experienceLevel: choreographies.experienceLevelId,
      modalityName: modalities.name,
      name: choreographies.name,
      orderNumber: presentations.orderNumber,
      submodalityId: choreographies.submodalityId,
      submodalityName: submodalities.name,
    })
    .from(presentations)
    .innerJoin(
      choreographies,
      eq(choreographies.id, presentations.choreographyId),
    )
    .innerJoin(academies, eq(academies.id, choreographies.academyId))
    .innerJoin(categories, eq(categories.id, choreographies.categoryId))
    .innerJoin(modalities, eq(modalities.id, choreographies.modalityId))
    .leftJoin(submodalities, eq(submodalities.id, choreographies.submodalityId))
    .where(eq(presentations.id, input.presentationId));

  if (!presentation) {
    return null;
  }

  const [judges, criteria] = await Promise.all([
    readPanel(executor, input),
    readSubmodalityCriteria(executor, presentation.submodalityId),
  ]);
  const disqualified = presentation.disqualifiedAt !== null;
  const average = presentationAverage({ disqualified, scores: judges });

  return {
    academyName: presentation.academyName,
    average,
    categoryName: presentation.categoryName,
    choreographyId: presentation.choreographyId,
    criteria,
    disqualified,
    experienceLevel: presentation.experienceLevel,
    judges,
    medal: average === null ? null : medalForAverage(average),
    modalityName: presentation.modalityName,
    name: presentation.name,
    orderNumber: presentation.orderNumber,
    presentationId: input.presentationId,
    submodalityName: presentation.submodalityName,
  };
}

/** The panel in the order it is read on screen: by the judge's name. */
async function readPanel(
  executor: Executor,
  input: { presentationId: string; storage?: FeedbackAudioStorage },
): Promise<PresentationJudgeScore[]> {
  const rows = await executor
    .select({
      annulled: scores.annulled,
      feedbackAudioStorageKey: scores.feedbackAudioStorageKey,
      judgeAssignmentId: judgeAssignments.id,
      judgeId: user.id,
      judgeName: user.name,
      scoreId: scores.id,
      value: scores.value,
    })
    .from(judgeAssignments)
    .innerJoin(user, eq(user.id, judgeAssignments.userId))
    .leftJoin(scores, eq(scores.judgeAssignmentId, judgeAssignments.id))
    .where(eq(judgeAssignments.presentationId, input.presentationId))
    .orderBy(asc(user.name));

  const sheets = await readSheetValuesByScore(
    executor,
    rows.map((row) => row.scoreId),
  );
  // Built once, and only when a take is actually stored: a panel that recorded
  // nothing must not need the storage env to be read at all.
  const storage = rows.some((row) => row.feedbackAudioStorageKey)
    ? (input.storage ?? createDefaultFeedbackAudioStorage())
    : null;

  return await Promise.all(
    rows.map(async (row) => ({
      annulled: row.annulled ?? false,
      criteriaValues: (row.scoreId && sheets.get(row.scoreId)) || {},
      feedbackAudioUrl: storage
        ? await loadFeedbackAudioDownloadUrl({
            storage,
            storageKey: row.feedbackAudioStorageKey,
          })
        : null,
      judgeAssignmentId: row.judgeAssignmentId,
      judgeId: row.judgeId,
      judgeName: row.judgeName,
      scoreId: row.scoreId,
      value: row.value,
    })),
  );
}

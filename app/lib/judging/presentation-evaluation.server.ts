import { asc, eq } from "drizzle-orm";

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
  user,
} from "@/db/schema";
import {
  type ExperienceLevelRequirement,
  experienceLevelRequirement,
} from "@/lib/choreographies/experience-level-requirement";
import type { Executor } from "@/lib/finances/choreography-cobro-support.server";
import {
  resolvePresentationResult,
  type PresentationResult,
} from "@/lib/judging/award";
import type { JudgeSheetCriterion } from "@/lib/judging/judge-list.server";
import {
  readPresentationResults,
  type AcademyAudience,
  type AdministrationAudience,
} from "@/lib/judging/presentation-results.server";
import { readSheetValuesByScore } from "@/lib/judging/sheet-values.server";
import {
  readSubmodalityCriteria,
  sheetSubjectColumns,
} from "@/lib/judging/submodality-criteria.server";
import type { ChoreographyGroupType } from "@/lib/portal/choreographies";
import {
  type FeedbackAudioStorage,
  createDefaultFeedbackAudioStorage,
  loadFeedbackAudioDownloadUrl,
} from "@/lib/storage/feedback-audio.server";

/**
 * One presentation's whole evaluation: its result beside the panel behind it.
 * See docs/domain/judging.md, "Program And Results" and "Scores And Feedback".
 * The audiences are `presentation-results.server.ts`'s, and only the two that
 * have a page for one presentation read it here.
 *
 * - `administration` reads the panel as its assignments: a judge with no score
 *   row is still a row, read as "Sin puntaje", so a gap is seen rather than a
 *   name that disappears. A withdrawn presentation is read too, flagged, since
 *   the scores page explains why it has nothing to settle.
 * - `academy` reads its own presentation only inside a published snapshot,
 *   and null for anything else, so a presentation it may not read leaks
 *   nothing, not even that it exists. A judge who saved nothing is nobody's
 *   result and is left out; on a disqualification every number and sheet line
 *   is dropped and each `Devolución` kept, so the academy still hears why.
 *
 * A judge's own list deliberately hides every other judge's work
 * (`judge-list.server.ts`); this is the read that puts it side by side.
 */

export type EvaluationTarget =
  { choreographyId: string } | { presentationId: string };

export type PresentationJudgeScore = {
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

type EvaluationFacts = {
  categoryName: string;
  choreographyId: string;
  /**
   * Empty when the presentation is scored with a single 0-100 value: its
   * submodality has no criteria, or it is a `Sin nivel` choreography.
   */
  criteria: JudgeSheetCriterion[];
  eventId: string;
  experienceLevel: string | null;
  /** Why an empty `experienceLevel` is empty, for the words a page shows. */
  experienceLevelRequirement: ExperienceLevelRequirement;
  groupType: ChoreographyGroupType;
  modalityName: string;
  name: string;
  orderNumber: number;
  presentationId: string;
  result: PresentationResult;
  scheduledDate: string;
  submodalityName: string | null;
};

export type AdministrationEvaluation = EvaluationFacts & {
  academyName: string;
  judges: PresentationJudgeScore[];
  /** `Evaluar como profesional`: the academy asked the judges to be severe. */
  professionalEvaluation: boolean;
  /**
   * `Coreografía retirada`: it keeps its number but is never judged, so the
   * panel has nothing to settle on it.
   */
  withdrawn: boolean;
};

export type AcademyEvaluationJudge = {
  /** The judge's sheet by criterion; empty without a sheet or when disqualified. */
  criteriaValues: Record<string, string>;
  feedbackAudioUrl: string | null;
  judgeId: string;
  judgeName: string;
  /** The judge's score as the numeric column reads it; null when disqualified. */
  value: string | null;
};

export type AcademyEvaluation = EvaluationFacts & {
  judges: AcademyEvaluationJudge[];
};

type EvaluationOptions = { storage?: FeedbackAudioStorage };

export async function readPresentationEvaluation(
  audience: AdministrationAudience,
  target: EvaluationTarget,
  options?: EvaluationOptions,
  executor?: Executor,
): Promise<AdministrationEvaluation | null>;
export async function readPresentationEvaluation(
  audience: AcademyAudience,
  target: { choreographyId: string },
  options?: EvaluationOptions,
  executor?: Executor,
): Promise<AcademyEvaluation | null>;
export async function readPresentationEvaluation(
  audience: AcademyAudience | AdministrationAudience,
  target: EvaluationTarget,
  options: EvaluationOptions = {},
  executor: Executor = db,
): Promise<AcademyEvaluation | AdministrationEvaluation | null> {
  if (audience.kind === "administration") {
    return await readAdministrationEvaluation(target, options, executor);
  }

  // Whether the academy reads this result at all is the list read's call,
  // so ownership, the publication gate and the withdrawn rule have one owner.
  const choreographyId =
    "choreographyId" in target ? target.choreographyId : "";
  const readable = await readPresentationResults(
    audience,
    [choreographyId],
    executor,
  );
  const gated = readable.get(choreographyId);
  const evaluation = gated
    ? await readAdministrationEvaluation(target, options, executor)
    : null;

  if (!gated || evaluation === null) {
    return null;
  }

  // The two reads are separate statements, so a reinstatement landing between
  // them must not reveal numbers the gated read still saw disqualified:
  // either read's disqualification redacts.
  const disqualified =
    gated.result.kind === "disqualified" ||
    evaluation.result.kind === "disqualified";
  const { academyName, professionalEvaluation, withdrawn, ...facts } =
    evaluation;

  return {
    ...facts,
    result: disqualified ? { kind: "disqualified" } : gated.result,
    criteria: disqualified ? [] : evaluation.criteria,
    judges: evaluation.judges
      .filter((judge) => judge.scoreId !== null)
      .map((judge) => ({
        criteriaValues: disqualified ? {} : judge.criteriaValues,
        feedbackAudioUrl: judge.feedbackAudioUrl,
        judgeId: judge.judgeId,
        judgeName: judge.judgeName,
        value: disqualified ? null : judge.value,
      })),
  };
}

async function readAdministrationEvaluation(
  target: EvaluationTarget,
  options: EvaluationOptions,
  executor: Executor,
): Promise<AdministrationEvaluation | null> {
  const [presentation] = await executor
    .select({
      ...sheetSubjectColumns,
      academyName: academies.name,
      categoryName: categories.name,
      choreographyId: choreographies.id,
      disqualifiedAt: presentations.disqualifiedAt,
      eventId: presentations.eventId,
      modalityName: modalities.name,
      name: choreographies.name,
      orderNumber: presentations.orderNumber,
      presentationId: presentations.id,
      professionalEvaluation: choreographies.professionalEvaluation,
      scheduledDate: schedules.scheduledDate,
      submodalityName: submodalities.name,
      withdrawnAt: choreographies.withdrawnAt,
    })
    .from(presentations)
    .innerJoin(
      choreographies,
      eq(choreographies.id, presentations.choreographyId),
    )
    .innerJoin(academies, eq(academies.id, choreographies.academyId))
    .innerJoin(categories, eq(categories.id, choreographies.categoryId))
    .innerJoin(modalities, eq(modalities.id, choreographies.modalityId))
    .innerJoin(schedules, eq(schedules.id, choreographies.scheduleId))
    .leftJoin(submodalities, eq(submodalities.id, choreographies.submodalityId))
    .where(
      "presentationId" in target
        ? eq(presentations.id, target.presentationId)
        : eq(presentations.choreographyId, target.choreographyId),
    );

  if (!presentation) {
    return null;
  }

  const [judges, criteria] = await Promise.all([
    readPanel(executor, presentation.presentationId, options),
    readSubmodalityCriteria(executor, presentation),
  ]);

  return {
    academyName: presentation.academyName,
    categoryName: presentation.categoryName,
    choreographyId: presentation.choreographyId,
    criteria,
    eventId: presentation.eventId,
    experienceLevel: presentation.experienceLevel,
    experienceLevelRequirement: experienceLevelRequirement(presentation),
    groupType: presentation.groupType as ChoreographyGroupType,
    judges,
    modalityName: presentation.modalityName,
    name: presentation.name,
    orderNumber: presentation.orderNumber,
    presentationId: presentation.presentationId,
    professionalEvaluation: presentation.professionalEvaluation,
    result: resolvePresentationResult({
      disqualified: presentation.disqualifiedAt !== null,
      values: judges.map((judge) => judge.value),
    }),
    scheduledDate: presentation.scheduledDate,
    submodalityName: presentation.submodalityName,
    withdrawn: presentation.withdrawnAt !== null,
  };
}

/** The panel in the order it is read on screen: by the judge's name. */
async function readPanel(
  executor: Executor,
  presentationId: string,
  options: EvaluationOptions,
): Promise<PresentationJudgeScore[]> {
  const rows = await executor
    .select({
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
    .where(eq(judgeAssignments.presentationId, presentationId))
    .orderBy(asc(user.name));

  const sheets = await readSheetValuesByScore(
    executor,
    rows.map((row) => row.scoreId),
  );
  // Built once, and only when a take is actually stored: a panel that recorded
  // nothing must not need the storage env to be read at all.
  const storage = rows.some((row) => row.feedbackAudioStorageKey)
    ? (options.storage ?? createDefaultFeedbackAudioStorage())
    : null;

  return await Promise.all(
    rows.map(async (row) => ({
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

import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  categories,
  choreographies,
  judgeAssignments,
  modalities,
  presentations,
  schedules,
  scores,
  submodalities,
  submodalityCriteria,
} from "@/db/schema";
import type { Executor } from "@/lib/finances/choreography-cobro-support.server";
import type { CriterionKind } from "@/lib/judging/criteria";
import {
  deriveJudgeScoreStatus,
  type JudgeScoreStatus,
} from "@/lib/judging/judge-status";
import { judgingDate } from "@/lib/judging/judging-day";
import type { ChoreographyGroupType } from "@/lib/portal/choreographies";

/**
 * What a judge sees when they sign in: the presentations assigned to them whose
 * day is open, in the order the show runs them. See docs/domain/judging.md,
 * "Scores And Feedback".
 *
 * The row carries what the judge needs to recognise the dance on stage and
 * nothing else — no academy, no score, no other judge's work — so that the list
 * cannot leak what the panel is not supposed to compare notes on. The judge's
 * own score is read only to derive their status, and stays here.
 */

export type JudgeSheetCriterion = {
  id: string;
  kind: CriterionKind;
  maximum: number;
  name: string;
};

export type JudgePresentationRow = {
  /** Empty when the submodality is scored with a single 0-100 value. */
  criteria: JudgeSheetCriterion[];
  categoryAdmitsExperienceLevels: boolean;
  categoryName: string;
  experienceLevel: string | null;
  groupType: ChoreographyGroupType;
  judgeAssignmentId: string;
  modalityName: string;
  name: string;
  orderNumber: number;
  presentationId: string;
  status: JudgeScoreStatus;
  submodalityName: string | null;
};

export async function readJudgePresentations(
  input: { judgeId: string; now?: Date },
  executor: Executor = db,
): Promise<JudgePresentationRow[]> {
  const rows = await executor
    .select({
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
    .innerJoin(categories, eq(categories.id, choreographies.categoryId))
    .innerJoin(modalities, eq(modalities.id, choreographies.modalityId))
    .innerJoin(schedules, eq(schedules.id, choreographies.scheduleId))
    .leftJoin(submodalities, eq(submodalities.id, choreographies.submodalityId))
    .leftJoin(scores, eq(scores.judgeAssignmentId, judgeAssignments.id))
    .where(
      and(
        eq(judgeAssignments.userId, input.judgeId),
        eq(schedules.scheduledDate, judgingDate(input.now)),
      ),
    )
    .orderBy(asc(presentations.orderNumber));

  const criteriaBySubmodality = await readCriteria(
    executor,
    rows.map((row) => row.submodalityId),
  );

  return rows.map((row) => ({
    categoryAdmitsExperienceLevels: row.categoryExperienceLevels.length > 0,
    categoryName: row.categoryName,
    criteria: row.submodalityId
      ? (criteriaBySubmodality.get(row.submodalityId) ?? [])
      : [],
    experienceLevel: row.experienceLevel,
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
  }));
}

async function readCriteria(
  executor: Executor,
  submodalityIds: (string | null)[],
): Promise<Map<string, JudgeSheetCriterion[]>> {
  const ids = [
    ...new Set(submodalityIds.filter((id): id is string => id !== null)),
  ];
  const bySubmodality = new Map<string, JudgeSheetCriterion[]>();

  if (ids.length === 0) {
    return bySubmodality;
  }

  const rows = await executor
    .select({
      id: submodalityCriteria.id,
      kind: submodalityCriteria.kind,
      maximum: submodalityCriteria.maximum,
      name: submodalityCriteria.name,
      submodalityId: submodalityCriteria.submodalityId,
    })
    .from(submodalityCriteria)
    .where(inArray(submodalityCriteria.submodalityId, ids))
    .orderBy(asc(submodalityCriteria.position));

  for (const row of rows) {
    const sheet = bySubmodality.get(row.submodalityId) ?? [];

    sheet.push({
      id: row.id,
      kind: row.kind,
      maximum: row.maximum,
      name: row.name,
    });
    bySubmodality.set(row.submodalityId, sheet);
  }

  return bySubmodality;
}

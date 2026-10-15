import { asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { judgeAssignments, presentations, scores, user } from "@/db/schema";
import type { Executor } from "@/lib/finances/choreography-cobro-support.server";
import {
  awardForAverage,
  presentationAverage,
  type AveragedScore,
  type Award,
} from "@/lib/judging/award";

/**
 * What the panel's work adds up to, for many presentations at once: the same
 * live average and award `presentation-scores.server.ts` reads for one, without
 * the panel behind it. See docs/domain/judging.md, "Scores And Feedback".
 */

export type PresentationResult = {
  /** Null for a disqualified presentation and when nothing counts. */
  average: number | null;
  disqualified: boolean;
  award: Award | null;
};

/**
 * Keyed by choreography. A choreography with no presentation is absent; one
 * with a presentation nobody scored reads a null average and no award.
 */
export async function readPresentationResults(
  choreographyIds: readonly string[],
  executor: Executor = db,
): Promise<Map<string, PresentationResult>> {
  if (choreographyIds.length === 0) {
    return new Map();
  }

  // One row per assignment, and one with null score columns for a presentation
  // or an assignment with nothing saved yet.
  const rows = await executor
    .select({
      choreographyId: presentations.choreographyId,
      disqualifiedAt: presentations.disqualifiedAt,
      value: scores.value,
    })
    .from(presentations)
    .leftJoin(
      judgeAssignments,
      eq(judgeAssignments.presentationId, presentations.id),
    )
    .leftJoin(scores, eq(scores.judgeAssignmentId, judgeAssignments.id))
    .where(inArray(presentations.choreographyId, [...choreographyIds]));

  const byChoreography = new Map<
    string,
    { disqualified: boolean; scores: AveragedScore[] }
  >();

  for (const row of rows) {
    const entry = byChoreography.get(row.choreographyId) ?? {
      disqualified: row.disqualifiedAt !== null,
      scores: [],
    };

    if (row.value !== null) {
      entry.scores.push({ value: row.value });
    }

    byChoreography.set(row.choreographyId, entry);
  }

  return new Map(
    [...byChoreography].map(([choreographyId, entry]) => {
      const average = presentationAverage(entry);

      return [
        choreographyId,
        {
          average,
          disqualified: entry.disqualified,
          award: average === null ? null : awardForAverage(average),
        },
      ];
    }),
  );
}

/** One judge's saved score on a presentation. */
export type PresentationJudgeValue = {
  judgeId: string;
  judgeName: string;
  /** As the numeric column reads it. */
  value: string | null;
};

/**
 * The panel's saved scores for many presentations at once, keyed by
 * choreography, by the judge's name as `presentation-scores.server.ts` reads
 * them. A judge with no score row is absent, as on the academy's evaluation;
 * nothing about feedback audio is read here.
 */
export async function readPresentationJudgeValues(
  choreographyIds: readonly string[],
  executor: Executor = db,
): Promise<Map<string, PresentationJudgeValue[]>> {
  if (choreographyIds.length === 0) {
    return new Map();
  }

  const rows = await executor
    .select({
      choreographyId: presentations.choreographyId,
      judgeId: user.id,
      judgeName: user.name,
      value: scores.value,
    })
    .from(presentations)
    .innerJoin(
      judgeAssignments,
      eq(judgeAssignments.presentationId, presentations.id),
    )
    .innerJoin(user, eq(user.id, judgeAssignments.userId))
    .innerJoin(scores, eq(scores.judgeAssignmentId, judgeAssignments.id))
    .where(inArray(presentations.choreographyId, [...choreographyIds]))
    .orderBy(asc(user.name), asc(user.id));

  const byChoreography = new Map<string, PresentationJudgeValue[]>();

  for (const { choreographyId, ...judge } of rows) {
    byChoreography.set(choreographyId, [
      ...(byChoreography.get(choreographyId) ?? []),
      judge,
    ]);
  }

  return byChoreography;
}

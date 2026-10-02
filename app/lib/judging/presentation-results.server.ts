import { eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { judgeAssignments, presentations, scores } from "@/db/schema";
import type { Executor } from "@/lib/finances/choreography-cobro-support.server";
import {
  medalForAverage,
  presentationAverage,
  type AveragedScore,
  type Medal,
} from "@/lib/judging/medal";

/**
 * What the panel's work adds up to, for many presentations at once: the same
 * live average and medal `presentation-scores.server.ts` reads for one, without
 * the panel behind it. See docs/domain/judging.md, "Scores And Feedback".
 */

export type PresentationResult = {
  /** Null for a disqualified presentation and when nothing counts. */
  average: number | null;
  disqualified: boolean;
  medal: Medal | null;
};

/**
 * Keyed by choreography. A choreography with no presentation is absent; one
 * with a presentation nobody scored reads a null average and no medal.
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
          medal: average === null ? null : medalForAverage(average),
        },
      ];
    }),
  );
}

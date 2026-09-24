import { eq, inArray } from "drizzle-orm";

import { scoreCriterionValues } from "@/db/schema";
import type { Executor } from "@/lib/finances/choreography-cobro-support.server";
import { formatScoreValue } from "@/lib/judging/score-value";

/**
 * How a sheet is stored, and read back, for the surfaces that do either: the
 * judge's own save and administration's edit write one, and the judge's list
 * and one presentation's panel read one back into a form. They go through the
 * same validation by design, and this is the other half of that — what they
 * write and what they read have to be the same shape too, or the same sheet
 * ends up meaning two things.
 */

/** One stored line: the criterion it answers, and the number the judge gave. */
export type SheetLine = { criterionId: string; value: number };

/**
 * The sheet is saved as a whole: what was stored before is cleared and the
 * validated lines are written in its place, so a criterion the submodality no
 * longer has cannot survive as a stale value under a total that ignores it.
 */
export async function writeSheetValues(
  executor: Executor,
  scoreId: string,
  values: readonly SheetLine[],
) {
  await executor
    .delete(scoreCriterionValues)
    .where(eq(scoreCriterionValues.scoreId, scoreId));

  if (values.length === 0) {
    return;
  }

  await executor.insert(scoreCriterionValues).values(
    values.map((line) => ({
      criterionId: line.criterionId,
      scoreId,
      value: formatScoreValue(line.value),
    })),
  );
}

/**
 * The stored sheets of many scores at once, keyed by score and then by
 * criterion, for the two surfaces that put a saved sheet back into a form. A
 * score with nothing stored is absent from the map, which reads the same as an
 * unfilled sheet.
 *
 * The values come out exactly as the column holds them, one decimal and all: a
 * field formats them for whoever typed them (see `formatScoreFieldValue`) and a
 * total re-reads them as numbers, and those two want different things.
 */
export async function readSheetValuesByScore(
  executor: Executor,
  scoreIds: readonly (string | null)[],
): Promise<Map<string, Record<string, string>>> {
  const ids = [...new Set(scoreIds.filter((id): id is string => id !== null))];
  const byScore = new Map<string, Record<string, string>>();

  if (ids.length === 0) {
    return byScore;
  }

  const rows = await executor
    .select({
      criterionId: scoreCriterionValues.criterionId,
      scoreId: scoreCriterionValues.scoreId,
      value: scoreCriterionValues.value,
    })
    .from(scoreCriterionValues)
    .where(inArray(scoreCriterionValues.scoreId, ids));

  for (const row of rows) {
    const sheet = byScore.get(row.scoreId) ?? {};

    sheet[row.criterionId] = row.value;
    byScore.set(row.scoreId, sheet);
  }

  return byScore;
}

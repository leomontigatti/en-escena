import { eq } from "drizzle-orm";

import { scoreCriterionValues } from "@/db/schema";
import type { Executor } from "@/lib/finances/choreography-cobro-support.server";
import { formatScoreValue } from "@/lib/judging/score-value";

/**
 * How a sheet is stored, for the two writes that store one: the judge's own
 * save and administration's edit. Both go through the same validation by
 * design, and this is the other half of that — what they write has to be the
 * same shape too, or the same sheet ends up meaning two things.
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

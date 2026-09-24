import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  choreographies,
  judgeAssignments,
  presentations,
  scoreCriterionValues,
  scores,
  submodalityCriteria,
} from "@/db/schema";
import {
  formatScoreValue,
  parseScoreValue,
  singleScoreMaximum,
} from "@/lib/judging/score-value";
import { validateSheetValues } from "@/lib/judging/sheet-total";

/**
 * What administration does to a panel's work after the fact: correct a score,
 * take one out of the average, and settle a disqualification. See
 * docs/domain/judging.md, "Scores And Feedback".
 *
 * None of it has a window, a reason or a trace. The judging day closes a
 * judge's own writes so that a show's scores stop moving once it ends, but
 * administration is the party that fixes what the panel got wrong — often days
 * later, from a phone call — and a correction that has to be justified in a
 * field nobody reads is a correction that gets made in the database instead.
 *
 * What administration cannot do is invent a judge's work: there is no create
 * here and no audio. A judge with no score row is a gap on the panel, and the
 * answer to a judge who never scored is to remove the assignment.
 *
 * Every value goes through the same parsing and the same sheet rules as the
 * judge's own save, so a score administration stores is a score a judge could
 * have typed.
 */

export type ScoreSettlementRefusal = "invalid-value" | "not-found";

export type ScoreSettlementResult =
  | { fieldErrors: Record<string, string>; ok: false; reason: "invalid-sheet" }
  | { ok: false; reason: ScoreSettlementRefusal }
  | { ok: true };

/**
 * Every write names the presentation as well as the score. The page is one
 * presentation's panel, so a score that belongs to another one is a request the
 * page could not have made, and refusing it here keeps the seam honest rather
 * than trusting an id that arrived in a form.
 */
export type ScoreSettlementTarget = { presentationId: string; scoreId: string };

export type EditScoreInput = ScoreSettlementTarget & {
  /** The sheet by criterion; read only when the submodality has criteria. */
  criteriaValues?: Record<string, string>;
  /** The single 0-100 score; ignored by a submodality judged on a sheet. */
  value?: string;
};

export async function editScore(
  input: EditScoreInput,
): Promise<ScoreSettlementResult> {
  return await db.transaction(async (tx) => {
    const criteria = await readScoreCriteria(tx, input);

    if (criteria === null) {
      return { ok: false, reason: "not-found" };
    }

    if (criteria.length === 0) {
      return await editSingleValue(tx, input);
    }

    return await editSheet(tx, input, criteria);
  });
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

type ScoreCriterion = {
  id: string;
  kind: "adds" | "deducts";
  maximum: number;
  name: string;
};

async function editSingleValue(
  tx: Transaction,
  input: EditScoreInput,
): Promise<ScoreSettlementResult> {
  const value = parseScoreValue(input.value ?? "", singleScoreMaximum);

  if (value === null) {
    return { ok: false, reason: "invalid-value" };
  }

  await tx
    .update(scores)
    .set({ updatedAt: new Date(), value: formatScoreValue(value) })
    .where(eq(scores.id, input.scoreId));

  return { ok: true };
}

/**
 * A sheet is stored as a whole and its total recomputed from it, exactly as the
 * judge's save does: the score's single value is never re-derived by whoever
 * reads it, so a corrected line has to move the total with it here.
 */
async function editSheet(
  tx: Transaction,
  input: EditScoreInput,
  criteria: readonly ScoreCriterion[],
): Promise<ScoreSettlementResult> {
  const validated = validateSheetValues(criteria, input.criteriaValues ?? {});

  if (!validated.ok) {
    return {
      fieldErrors: validated.fieldErrors,
      ok: false,
      reason: "invalid-sheet",
    };
  }

  await tx
    .update(scores)
    .set({ updatedAt: new Date(), value: formatScoreValue(validated.total) })
    .where(eq(scores.id, input.scoreId));

  await tx
    .delete(scoreCriterionValues)
    .where(eq(scoreCriterionValues.scoreId, input.scoreId));

  await tx.insert(scoreCriterionValues).values(
    validated.values.map((line) => ({
      criterionId: line.criterionId,
      scoreId: input.scoreId,
      value: formatScoreValue(line.value),
    })),
  );

  return { ok: true };
}

/**
 * The criteria the score is judged on, walked from the score itself rather than
 * trusted from the page: an empty array is a single 0-100 value, and null is a
 * score that is not there to edit.
 */
async function readScoreCriteria(
  tx: Transaction,
  target: ScoreSettlementTarget,
): Promise<ScoreCriterion[] | null> {
  const [found] = await tx
    .select({ submodalityId: choreographies.submodalityId })
    .from(scores)
    .innerJoin(
      judgeAssignments,
      eq(judgeAssignments.id, scores.judgeAssignmentId),
    )
    .innerJoin(
      presentations,
      eq(presentations.id, judgeAssignments.presentationId),
    )
    .innerJoin(
      choreographies,
      eq(choreographies.id, presentations.choreographyId),
    )
    .where(
      and(
        eq(scores.id, target.scoreId),
        eq(judgeAssignments.presentationId, target.presentationId),
      ),
    )
    .for("update", { of: scores });

  if (!found) {
    return null;
  }

  if (found.submodalityId === null) {
    return [];
  }

  return await tx
    .select({
      id: submodalityCriteria.id,
      kind: submodalityCriteria.kind,
      maximum: submodalityCriteria.maximum,
      name: submodalityCriteria.name,
    })
    .from(submodalityCriteria)
    .where(eq(submodalityCriteria.submodalityId, found.submodalityId))
    .orderBy(asc(submodalityCriteria.position));
}

/**
 * The toggle that takes a score out of the average and brings it back. The row
 * stays exactly as the judge left it — the value, the sheet and the take — so
 * an annulment is a decision about what counts, not a deletion dressed up as
 * one.
 */
export async function annulScore(
  input: ScoreSettlementTarget & { annulled: boolean },
): Promise<ScoreSettlementResult> {
  const updated = await db
    .update(scores)
    .set({ annulled: input.annulled, updatedAt: new Date() })
    .where(
      and(
        eq(scores.id, input.scoreId),
        inArray(
          scores.judgeAssignmentId,
          db
            .select({ id: judgeAssignments.id })
            .from(judgeAssignments)
            .where(eq(judgeAssignments.presentationId, input.presentationId)),
        ),
      ),
    )
    .returning({ id: scores.id });

  return updated.length === 0
    ? { ok: false, reason: "not-found" }
    : { ok: true };
}

/**
 * Administration's own disqualification, which unlike the judges' has no day to
 * be open on: a presentation is settled whenever the question is settled, and
 * that is routinely after the show it belonged to. Reinstating clears the
 * timestamp and nothing else, so the scores saved before come back with it.
 */
export async function setPresentationDisqualified(input: {
  disqualified: boolean;
  presentationId: string;
}): Promise<ScoreSettlementResult> {
  const updated = await db
    .update(presentations)
    .set({ disqualifiedAt: input.disqualified ? new Date() : null })
    .where(eq(presentations.id, input.presentationId))
    .returning({ id: presentations.id });

  return updated.length === 0
    ? { ok: false, reason: "not-found" }
    : { ok: true };
}

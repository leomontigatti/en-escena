import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  choreographies,
  judgeAssignments,
  presentations,
  scores,
  submodalities,
  submodalityCriteria,
} from "@/db/schema";
import {
  eventBaseEntityNotFound,
  normalizeEventBaseName,
  requiredFieldMessage,
  toTitleCase,
} from "@/lib/events/bases-repository/shared.server";
import type {
  EventBaseFailure,
  EventBasesDeleteResult,
} from "@/lib/events/bases-repository/shared.server";
import {
  duplicateCriterionNameErrors,
  validateCriteriaMaxima,
  type CriterionKind,
} from "@/lib/judging/criteria";

const lockedSubmodalityCriteriaError =
  "No se pueden cambiar los criterios porque la submodalidad ya tiene puntajes.";

export type SubmodalityCriterionInput = {
  kind: CriterionKind;
  maximum: string;
  name: string;
};

/**
 * Every criterion of the event, in sheet order, for the modality page to hand
 * each submodality row its own set. The page already holds the whole catalog of
 * the active event, so one query per page beats one per submodality.
 */
export async function listSubmodalityCriteria(eventId: string) {
  return db.query.submodalityCriteria.findMany({
    where: eq(submodalityCriteria.eventId, eventId),
    orderBy: [
      asc(submodalityCriteria.submodalityId),
      asc(submodalityCriteria.position),
    ],
  });
}

/**
 * The submodalities of the event whose criteria are locked. A submodality is
 * locked as soon as one judge has saved a score on a presentation of a
 * choreography that has it: the numbers already given mean "out of this sheet",
 * so the sheet cannot change underneath them.
 */
export async function findScoreLockedSubmodalityIds(
  eventId: string,
): Promise<Set<string>> {
  const rows = await db
    .selectDistinct({ submodalityId: choreographies.submodalityId })
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
    .where(eq(choreographies.eventId, eventId));

  return new Set(
    rows
      .map((row) => row.submodalityId)
      .filter((submodalityId): submodalityId is string =>
        Boolean(submodalityId),
      ),
  );
}

export async function isSubmodalityScoreLocked(
  submodalityId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ scoreId: scores.id })
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
      and(
        eq(choreographies.id, presentations.choreographyId),
        eq(choreographies.submodalityId, submodalityId),
      ),
    )
    .limit(1);

  return Boolean(row);
}

/**
 * Saves a submodality's sheet as a whole. The criteria describe one sheet, so a
 * half-applied change would leave a sheet that adds up to something other than
 * 100; the whole set is deleted and written again inside one transaction.
 *
 * Deleting rather than diffing is safe precisely because a locked submodality is
 * refused first: with no score pointing at any criterion, no identity has to
 * survive the save, and rewriting sidesteps the `(submodality, lower(name))`
 * index rejecting a rename that only swaps two names.
 */
export async function replaceSubmodalityCriteria(
  submodalityId: string,
  input: { criteria: SubmodalityCriterionInput[] },
): Promise<EventBasesDeleteResult> {
  const submodality = await db.query.submodalities.findFirst({
    where: eq(submodalities.id, submodalityId),
  });

  if (!submodality) {
    return eventBaseEntityNotFound("submodality");
  }

  if (await isSubmodalityScoreLocked(submodalityId)) {
    return {
      ok: false,
      code: "event-bases-has-dependencies",
      error: lockedSubmodalityCriteriaError,
    };
  }

  const validation = validateSubmodalityCriteriaInput(input.criteria);

  if (!validation.ok) {
    return validation;
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(submodalityCriteria)
      .where(eq(submodalityCriteria.submodalityId, submodalityId));

    if (input.criteria.length === 0) {
      return;
    }

    await tx.insert(submodalityCriteria).values(
      input.criteria.map((criterion, position) => ({
        eventId: submodality.eventId,
        kind: criterion.kind,
        maximum: Number.parseInt(criterion.maximum.trim(), 10),
        name: toTitleCase(criterion.name),
        position,
        submodalityId,
      })),
    );
  });

  return { ok: true };
}

function validateSubmodalityCriteriaInput(
  criteria: SubmodalityCriterionInput[],
): { ok: true } | EventBaseFailure {
  const fieldErrors: Record<string, string> = {};

  criteria.forEach((criterion, index) => {
    if (!normalizeEventBaseName(criterion.name)) {
      fieldErrors[`criteria.${index}.name`] = requiredFieldMessage;
    }
  });

  const duplicates = duplicateCriterionNameErrors(
    criteria.map((criterion) => criterion.name),
  );

  for (const [index, message] of duplicates) {
    fieldErrors[`criteria.${index}.name`] = message;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      code: duplicates.size > 0 ? "duplicate-name" : "invalid-event-bases",
      error: invalidCriteriaError,
      fieldErrors,
    };
  }

  const maximaValidation = validateCriteriaMaxima(criteria);

  if (!maximaValidation.ok) {
    return {
      ok: false,
      code: "invalid-event-bases",
      error: invalidCriteriaError,
      fieldErrors: maximaValidation.fieldErrors,
    };
  }

  return { ok: true };
}

const invalidCriteriaError = "Revisá los criterios de la submodalidad.";

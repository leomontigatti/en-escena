import { and, asc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  categories,
  categoryModalities,
  choreographies,
  judgeAssignments,
  modalities,
  presentations,
  scores,
  submodalities,
  submodalityCriteria,
} from "@/db/schema";
import {
  eventBaseEntityNotFound,
  toTitleCase,
} from "@/lib/events/bases-repository/shared.server";
import type { EventBasesDeleteResult } from "@/lib/events/bases-repository/shared.server";
import {
  experienceLevelOrder,
  type ExperienceLevel,
} from "@/lib/events/experience-levels";
import {
  duplicateCriterionNameMessage,
  type CriterionKind,
} from "@/lib/judging/criteria";
import {
  sheetRuleFor,
  validateSheetCriteria,
  type OfferedSheets,
} from "@/lib/judging/sheet-criteria";

const lockedSubmodalityCriteriaError =
  "No se pueden cambiar los criterios porque la submodalidad ya tiene puntajes.";

export type SubmodalityCriterionInput = {
  kind: CriterionKind;
  maximum: string;
  name: string;
};

/**
 * Every criterion of the event, general and per level, for the modality page to
 * hand each submodality's editor its own. The page already holds the whole
 * catalog of the active event, so one query per page beats one per
 * submodality.
 */
export async function listSubmodalityCriteria(eventId: string) {
  return db.query.submodalityCriteria.findMany({
    where: eq(submodalityCriteria.eventId, eventId),
    orderBy: [
      asc(submodalityCriteria.submodalityId),
      asc(sql`${submodalityCriteria.experienceLevel} is not null`),
      asc(submodalityCriteria.position),
    ],
  });
}

/**
 * Which sheets each modality of the event is scored on, read off the categories
 * that offer it: one per level they admit, and the general criteria on their
 * own where one admits none. A modality no category offers yet is treated as
 * the latter, the one sheet it would have.
 */
export async function readModalitySheets(
  eventId: string,
): Promise<Map<string, OfferedSheets>> {
  const rows = await db
    .select({
      experienceLevels: categories.experienceLevels,
      modalityId: modalities.id,
    })
    .from(modalities)
    .leftJoin(
      categoryModalities,
      eq(categoryModalities.modalityId, modalities.id),
    )
    .leftJoin(categories, eq(categories.id, categoryModalities.categoryId))
    .where(eq(modalities.eventId, eventId));
  const levelsByModality = new Map<string, Set<ExperienceLevel>>();
  const standsAlone = new Set<string>();

  for (const row of rows) {
    const levels = levelsByModality.get(row.modalityId) ?? new Set();

    levelsByModality.set(row.modalityId, levels);

    if (!row.experienceLevels || row.experienceLevels.length === 0) {
      standsAlone.add(row.modalityId);
    }

    for (const level of row.experienceLevels ?? []) {
      levels.add(level);
    }
  }

  return new Map(
    [...levelsByModality].map(([modalityId, levels]) => [
      modalityId,
      {
        generalStandsAlone: standsAlone.has(modalityId),
        levels: experienceLevelOrder.filter((level) => levels.has(level)),
      },
    ]),
  );
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
 * Saves one sheet of a submodality as a whole: its general criteria, or one
 * level's own. Each is checked against the sheets it belongs to
 * (`sheet-criteria.ts`) with the rest of the submodality as stored, so the save
 * and the editor refuse the same lists.
 *
 * Deleting rather than diffing is safe precisely because a locked submodality is
 * refused first: with no score pointing at any criterion, no identity has to
 * survive the save, and rewriting sidesteps the name indexes rejecting a rename
 * that only swaps two names.
 */
export async function replaceSheetCriteria(
  submodalityId: string,
  input: {
    criteria: SubmodalityCriterionInput[];
    experienceLevel: ExperienceLevel | null;
  },
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

  const [stored, sheets] = await Promise.all([
    db.query.submodalityCriteria.findMany({
      where: eq(submodalityCriteria.submodalityId, submodalityId),
    }),
    readModalitySheets(submodality.eventId),
  ]);
  const validation = validateSheetCriteria(
    input.criteria,
    sheetRuleFor(
      input.experienceLevel,
      stored,
      sheets.get(submodality.modalityId) ?? {
        generalStandsAlone: true,
        levels: [],
      },
    ),
  );

  if (!validation.ok) {
    return {
      ok: false,
      code: Object.values(validation.fieldErrors).includes(
        duplicateCriterionNameMessage,
      )
        ? "duplicate-name"
        : "invalid-event-bases",
      error: invalidCriteriaError,
      fieldErrors: validation.fieldErrors,
    };
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(submodalityCriteria)
      .where(
        and(
          eq(submodalityCriteria.submodalityId, submodalityId),
          input.experienceLevel === null
            ? isNull(submodalityCriteria.experienceLevel)
            : eq(submodalityCriteria.experienceLevel, input.experienceLevel),
        ),
      );

    if (input.criteria.length === 0) {
      return;
    }

    await tx.insert(submodalityCriteria).values(
      input.criteria.map((criterion, position) => ({
        eventId: submodality.eventId,
        experienceLevel: input.experienceLevel,
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

const invalidCriteriaError = "Revisá los criterios de la submodalidad.";

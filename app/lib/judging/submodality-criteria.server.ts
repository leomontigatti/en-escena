import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";

import {
  categories,
  choreographies,
  presentations,
  submodalityCriteria,
} from "@/db/schema";
import { experienceLevelRequirement } from "@/lib/choreographies/experience-level-requirement";
import type { ExperienceLevel } from "@/lib/events/experience-levels";
import type { GroupType } from "@/lib/events/group-types";
import type { Executor } from "@/lib/finances/choreography-cobro-support.server";
import type { SheetCriterion } from "@/lib/judging/sheet-total";

/**
 * The one place a submodality's criteria are read from. Four callers need the
 * same sheet — the judge's list, one presentation's panel, the judge's save and
 * administration's edit — and they have to read it the same way or the same
 * dance is scored on two different sheets: the same columns, and above all the
 * same `position` order, which is the order the judge fills the fields in, and
 * the same cut by level: the general criteria and those of the choreography's
 * own level, never another level's, and no sheet at all for a `Sin nivel`
 * choreography (see `scoresSingleValue`).
 *
 * Each reader is the same query under a different key, so which one a caller
 * wants is only about what it already has in hand.
 */

/** What every reader selects: the sheet as the form and the total need it. */
const criterionColumns = {
  experienceLevel: submodalityCriteria.experienceLevel,
  id: submodalityCriteria.id,
  kind: submodalityCriteria.kind,
  maximum: submodalityCriteria.maximum,
  name: submodalityCriteria.name,
};

/**
 * The order of a sheet: the general criteria (`Evaluación general`) first and
 * the level's own (`Técnico obligatorio`) after them, each part in its
 * configured position.
 */
const sheetOrder = [
  asc(sql`${submodalityCriteria.experienceLevel} is not null`),
  asc(submodalityCriteria.position),
];

/**
 * What decides which sheet a choreography is scored on: its submodality, its
 * level, and whether that level was required, optional or not offered at all.
 */
export type SheetSubject = {
  categoryExperienceLevels: readonly ExperienceLevel[];
  experienceLevel: ExperienceLevel | null;
  groupType: GroupType;
  submodalityId: string | null;
};

/**
 * Whether the choreography is scored with a single 0-100 value whatever its
 * submodality's criteria: a grupal that chose `Sin nivel` did not compete by
 * level, so it is not put on a sheet built for levels, general part included.
 * A blank level that was required (`Sin asignar`) or not offered (`No aplica`)
 * keeps the general criteria. See docs/domain/judging.md.
 */
function scoresSingleValue(subject: SheetSubject) {
  return (
    subject.experienceLevel === null &&
    experienceLevelRequirement(subject) === "optional"
  );
}

/** The general criteria, and those of the level when there is one. */
function onSheetOf(experienceLevel: ExperienceLevel | null) {
  return experienceLevel === null
    ? isNull(submodalityCriteria.experienceLevel)
    : or(
        isNull(submodalityCriteria.experienceLevel),
        eq(submodalityCriteria.experienceLevel, experienceLevel),
      );
}

/**
 * The sheet a choreography is scored on. A submodality without criteria, and a
 * `Sin nivel` choreography, score a single value.
 */
export async function readSubmodalityCriteria(
  executor: Executor,
  subject: SheetSubject,
): Promise<SheetCriterion[]> {
  if (subject.submodalityId === null || scoresSingleValue(subject)) {
    return [];
  }

  return await executor
    .select(criterionColumns)
    .from(submodalityCriteria)
    .where(
      and(
        eq(submodalityCriteria.submodalityId, subject.submodalityId),
        onSheetOf(subject.experienceLevel),
      ),
    )
    .orderBy(...sheetOrder);
}

/**
 * One choreography's sheet cut from every criterion of its submodality, as
 * `readCriteriaBySubmodality` returns them: already in sheet order, so cutting
 * keeps it.
 */
export function sheetForChoreography(
  criteria: readonly SheetCriterion[],
  subject: SheetSubject,
): SheetCriterion[] {
  if (scoresSingleValue(subject)) {
    return [];
  }

  return criteria.filter(
    (criterion) =>
      criterion.experienceLevel === null ||
      criterion.experienceLevel === subject.experienceLevel,
  );
}

/**
 * Every criterion of many submodalities at once, keyed by submodality and in
 * sheet order, for a list that would otherwise ask once per row; each row cuts
 * its own sheet with `sheetForChoreography`. A submodality with no criteria is
 * absent from the map, which reads the same as an empty sheet.
 */
export async function readCriteriaBySubmodality(
  executor: Executor,
  submodalityIds: readonly (string | null)[],
): Promise<Map<string, SheetCriterion[]>> {
  const ids = [
    ...new Set(submodalityIds.filter((id): id is string => id !== null)),
  ];
  const bySubmodality = new Map<string, SheetCriterion[]>();

  if (ids.length === 0) {
    return bySubmodality;
  }

  const rows = await executor
    .select({
      ...criterionColumns,
      submodalityId: submodalityCriteria.submodalityId,
    })
    .from(submodalityCriteria)
    .where(inArray(submodalityCriteria.submodalityId, ids))
    .orderBy(...sheetOrder);

  for (const row of rows) {
    const sheet = bySubmodality.get(row.submodalityId) ?? [];

    sheet.push({
      experienceLevel: row.experienceLevel,
      id: row.id,
      kind: row.kind,
      maximum: row.maximum,
      name: row.name,
    });
    bySubmodality.set(row.submodalityId, sheet);
  }

  return bySubmodality;
}

/**
 * What a query joined to the choreography and its category selects to hand
 * `readSubmodalityCriteria` or `sheetForChoreography` their `SheetSubject`.
 */
export const sheetSubjectColumns = {
  categoryExperienceLevels: categories.experienceLevels,
  experienceLevel: choreographies.experienceLevelId,
  groupType: choreographies.groupType,
  submodalityId: choreographies.submodalityId,
};

/**
 * The sheet a presentation is scored on, walked from the presentation itself.
 * A save reads it this way rather than trusting the submodality the page was
 * rendered with: a criterion added since is a line the judge has to fill, and
 * one removed is a value that must not be stored.
 */
export async function readPresentationCriteria(
  executor: Executor,
  presentationId: string,
): Promise<SheetCriterion[]> {
  const [subject] = await executor
    .select(sheetSubjectColumns)
    .from(presentations)
    .innerJoin(
      choreographies,
      eq(choreographies.id, presentations.choreographyId),
    )
    .innerJoin(categories, eq(categories.id, choreographies.categoryId))
    .where(eq(presentations.id, presentationId));

  return subject ? await readSubmodalityCriteria(executor, subject) : [];
}

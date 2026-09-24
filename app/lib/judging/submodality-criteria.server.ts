import { asc, eq, inArray } from "drizzle-orm";

import {
  choreographies,
  presentations,
  submodalityCriteria,
} from "@/db/schema";
import type { Executor } from "@/lib/finances/choreography-cobro-support.server";
import type { SheetCriterion } from "@/lib/judging/sheet-total";

/**
 * The one place a submodality's criteria are read from. Four callers need the
 * same sheet — the judge's list, one presentation's panel, the judge's save and
 * administration's edit — and they have to read it the same way or the same
 * dance is scored on two different sheets: the same columns, and above all the
 * same `position` order, which is the order the judge fills the fields in.
 *
 * Each reader is the same query under a different key, so which one a caller
 * wants is only about what it already has in hand.
 */

/** What every reader selects: the sheet as the form and the total need it. */
const criterionColumns = {
  id: submodalityCriteria.id,
  kind: submodalityCriteria.kind,
  maximum: submodalityCriteria.maximum,
  name: submodalityCriteria.name,
};

/** A submodality's sheet. A submodality without one scores a single value. */
export async function readSubmodalityCriteria(
  executor: Executor,
  submodalityId: string | null,
): Promise<SheetCriterion[]> {
  if (submodalityId === null) {
    return [];
  }

  return await executor
    .select(criterionColumns)
    .from(submodalityCriteria)
    .where(eq(submodalityCriteria.submodalityId, submodalityId))
    .orderBy(asc(submodalityCriteria.position));
}

/**
 * The sheets of many submodalities at once, keyed by submodality, for a list
 * that would otherwise ask once per row. A submodality with no criteria is
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
  return await executor
    .select(criterionColumns)
    .from(presentations)
    .innerJoin(
      choreographies,
      eq(choreographies.id, presentations.choreographyId),
    )
    .innerJoin(
      submodalityCriteria,
      eq(submodalityCriteria.submodalityId, choreographies.submodalityId),
    )
    .where(eq(presentations.id, presentationId))
    .orderBy(asc(submodalityCriteria.position));
}

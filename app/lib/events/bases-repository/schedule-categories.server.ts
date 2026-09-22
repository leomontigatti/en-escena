import { and, asc, eq, inArray, notInArray } from "drizzle-orm";

import { notWithdrawnChoreography } from "@/lib/choreographies/withdrawn-choreography";
import {
  categories,
  categoryModalities,
  choreographies,
  db,
  scheduleCategories,
  uniqueValues,
} from "@/lib/events/bases-repository/shared.server";
import type {
  EventBasesTransaction,
  ScheduleAcceptedCategory,
} from "@/lib/events/bases-repository/shared.server";

/**
 * The categories a schedule accepts: the optional counterpart of the modalities
 * it accepts. No row for a schedule means it accepts every category, so this
 * module never writes a placeholder and never reads one.
 */
export async function listAcceptedCategories(scheduleIds: string[]) {
  return await db
    .select({
      scheduleId: scheduleCategories.scheduleId,
      id: categories.id,
      name: categories.name,
      minAge: categories.minAge,
      maxAge: categories.maxAge,
      groupTypes: categories.groupTypes,
    })
    .from(scheduleCategories)
    .innerJoin(categories, eq(scheduleCategories.categoryId, categories.id))
    .where(inArray(scheduleCategories.scheduleId, scheduleIds))
    .orderBy(asc(categories.minAge), asc(categories.name));
}

/**
 * Whether every listed category is one the schedule could ever place: of the
 * same event, and sharing at least one modality with the modalities being saved.
 * Read against the input's modalities rather than the stored ones, so narrowing
 * a schedule's modalities re-checks the categories it already lists.
 *
 * A schedule with no modalities places nothing, so no category can share one
 * with it.
 */
export async function everyCategorySharesAModality({
  categoryIds,
  eventId,
  modalityIds,
}: {
  categoryIds: string[];
  eventId: string;
  modalityIds: string[];
}) {
  if (modalityIds.length === 0) {
    return false;
  }

  const compatibleCategories = await db
    .selectDistinct({ id: categories.id })
    .from(categories)
    .innerJoin(
      categoryModalities,
      eq(categoryModalities.categoryId, categories.id),
    )
    .where(
      and(
        eq(categories.eventId, eventId),
        inArray(categories.id, categoryIds),
        inArray(categoryModalities.modalityId, modalityIds),
      ),
    );

  return compatibleCategories.length === categoryIds.length;
}

/**
 * The categories of the schedule's occupying choreographies that `categoryIds`
 * would leave out, by name. An empty list of accepted categories accepts every
 * one of them, so it never excludes anything and is not asked about.
 *
 * Withdrawn choreographies are absent on purpose: like every other schedule
 * restructuring guard, this one only protects what still holds a place.
 */
export async function listExcludedOccupiedCategories(
  scheduleId: string,
  categoryIds: string[],
) {
  if (categoryIds.length === 0) {
    return [];
  }

  const excluded = await db
    .selectDistinct({ name: categories.name })
    .from(choreographies)
    .innerJoin(categories, eq(choreographies.categoryId, categories.id))
    .where(
      and(
        eq(choreographies.scheduleId, scheduleId),
        notInArray(choreographies.categoryId, categoryIds),
        notWithdrawnChoreography(),
      ),
    )
    .orderBy(asc(categories.name));

  return excluded.map((category) => category.name);
}

export async function insertScheduleCategories(
  tx: EventBasesTransaction,
  scheduleId: string,
  categoryIds: string[] | undefined,
) {
  const values = getScheduleCategoryValues(scheduleId, categoryIds);

  if (values.length === 0) {
    return;
  }

  await tx.insert(scheduleCategories).values(values);
}

export async function replaceScheduleCategories(
  tx: EventBasesTransaction,
  scheduleId: string,
  categoryIds: string[] | undefined,
) {
  await tx
    .delete(scheduleCategories)
    .where(eq(scheduleCategories.scheduleId, scheduleId));
  await insertScheduleCategories(tx, scheduleId, categoryIds);
}

function getScheduleCategoryValues(
  scheduleId: string,
  categoryIds: string[] | undefined,
) {
  return uniqueValues(categoryIds ?? []).map((categoryId) => ({
    scheduleId,
    categoryId,
  }));
}

export function groupScheduleCategories(
  acceptedCategories: Array<ScheduleAcceptedCategory & { scheduleId: string }>,
) {
  const categoriesByScheduleId = new Map<string, ScheduleAcceptedCategory[]>();

  for (const { scheduleId, ...category } of acceptedCategories) {
    const scheduleEntries = categoriesByScheduleId.get(scheduleId) ?? [];

    scheduleEntries.push(category);
    categoriesByScheduleId.set(scheduleId, scheduleEntries);
  }

  return categoriesByScheduleId;
}

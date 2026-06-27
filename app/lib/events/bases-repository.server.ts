import { asc, eq } from "drizzle-orm";

import {
  categories,
  categoryExperienceLevels,
  categoryModalities,
  db,
  experienceLevels,
  groupRelationIdsByCategory,
  modalities,
  submodalities,
} from "@/lib/events/bases-repository/shared.server";
export type {
  CompatibleScheduleCapacity,
  CompatibleScheduleCapacityResolution,
  EventBasesDeleteResult,
  EventBasesMutationResult,
  PriceInput,
  PriceListItem,
  PriceResolutionResult,
  ScheduleInput,
  ScheduleCapacityInput,
  ScheduleListItem,
  ScheduleWithEntriesInput,
} from "@/lib/events/bases-repository/shared.server";
export {
  createCategory,
  deleteCategory,
  updateCategory,
} from "@/lib/events/bases-repository/categories.server";
export {
  createExperienceLevel,
  createModality,
  createSubmodality,
  deleteExperienceLevel,
  deleteModality,
  deleteSubmodality,
  ensureExperienceLevelsForEvent,
  listChoreographyRegistrationBaseOptionsData,
  updateExperienceLevel,
  updateModality,
  updateModalityWithSubmodalities,
  updateSubmodality,
} from "@/lib/events/bases-repository/modalities.server";
export {
  createPrice,
  deletePrice,
  resolveApplicablePrice,
  updatePrice,
} from "@/lib/events/bases-repository/prices.server";
export {
  createScheduleCapacity,
  deleteScheduleCapacity,
  resolveCompatibleScheduleCapacities,
  updateScheduleCapacity,
} from "@/lib/events/bases-repository/schedule-capacities.server";
export {
  createSchedule,
  createScheduleWithEntries,
  deleteSchedule,
  updateSchedule,
  updateScheduleWithEntries,
} from "@/lib/events/bases-repository/schedules.server";

import { listPrices } from "@/lib/events/bases-repository/prices.server";
import { listSchedules } from "@/lib/events/bases-repository/schedules.server";

export async function listEventBasesData(eventId: string) {
  const [
    eventModalities,
    eventSubmodalities,
    eventExperienceLevels,
    eventCategories,
    eventCategoryModalities,
    eventCategoryExperienceLevels,
    eventSchedules,
    eventPrices,
  ] = await Promise.all([
    db.query.modalities.findMany({
      where: eq(modalities.eventId, eventId),
      orderBy: [asc(modalities.name)],
    }),
    db.query.submodalities.findMany({
      where: eq(submodalities.eventId, eventId),
      orderBy: [asc(submodalities.name)],
    }),
    db.query.experienceLevels.findMany({
      where: eq(experienceLevels.eventId, eventId),
      orderBy: [asc(experienceLevels.name)],
    }),
    db.query.categories.findMany({
      where: eq(categories.eventId, eventId),
      orderBy: [
        asc(categories.minAge),
        asc(categories.maxAge),
        asc(categories.name),
      ],
    }),
    db
      .select({
        categoryId: categoryModalities.categoryId,
        modalityId: categoryModalities.modalityId,
      })
      .from(categoryModalities)
      .innerJoin(categories, eq(categories.id, categoryModalities.categoryId))
      .where(eq(categories.eventId, eventId)),
    db
      .select({
        categoryId: categoryExperienceLevels.categoryId,
        experienceLevelId: categoryExperienceLevels.experienceLevelId,
      })
      .from(categoryExperienceLevels)
      .innerJoin(
        categories,
        eq(categories.id, categoryExperienceLevels.categoryId),
      )
      .where(eq(categories.eventId, eventId)),
    listSchedules(eventId),
    listPrices(eventId),
  ]);

  const modalityIdsByCategory = groupRelationIdsByCategory(
    eventCategoryModalities,
    (relation) => relation.modalityId,
  );
  const experienceLevelIdsByCategory = groupRelationIdsByCategory(
    eventCategoryExperienceLevels,
    (relation) => relation.experienceLevelId,
  );

  return {
    modalities: eventModalities,
    submodalities: eventSubmodalities,
    experienceLevels: eventExperienceLevels,
    categories: eventCategories.map((category) => ({
      ...category,
      modalityIds: modalityIdsByCategory.get(category.id) ?? [],
      experienceLevelIds: experienceLevelIdsByCategory.get(category.id) ?? [],
    })),
    schedules: eventSchedules,
    prices: eventPrices,
  };
}

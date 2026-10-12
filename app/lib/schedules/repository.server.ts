import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  categories,
  choreographies,
  modalities,
  scheduleCapacities,
  scheduleModalities,
  schedules,
} from "@/db/schema";
import { isScheduleCoveredByPrice } from "@/lib/prices/price-schedules.server";
import {
  created,
  eventBaseCopy,
  eventBaseEntityNotFound,
  type EventBaseFailure,
  type EventBasesDeleteResult,
  type EventBasesMutationResult,
} from "@/lib/events/bases-kernel.server";
import {
  hasReferencingChoreographies,
  uniqueValues,
} from "@/lib/events/bases-repository/shared.server";
import { requiredFieldMessage } from "@/lib/shared/forms";
import { toTitleCase } from "@/lib/shared/text-normalization";
import {
  toScheduleColumnValues,
  validateScheduleTimingInput,
} from "@/lib/schedules/schedule-values.server";
import {
  everyCategorySharesAModality,
  groupScheduleCategories,
  insertScheduleCategories,
  listAcceptedCategories,
  replaceScheduleCategories,
} from "@/lib/schedules/accepted-categories.server";
import {
  getScheduleModalityValues,
  groupScheduleModalities,
} from "@/lib/schedules/accepted-modalities.server";
import {
  scheduleHasOperationalDependencies,
  validateStructuralScheduleChangesLocked,
} from "@/lib/schedules/schedule-structure.server";
import {
  groupScheduleCapacities,
  releaseScheduleCapacityReferences,
  validateInlineScheduleCapacitiesInput,
  validateInlineScheduleCapacityDependencies,
  type ScheduleCapacityInput,
  type ScheduleCapacityListItem,
} from "@/lib/schedules/capacities.server";
import {
  resolveScheduleCapacityOccupancies,
  toScheduleCapacityOccupancyKey,
  type ScheduleCapacityOccupancy,
} from "@/lib/choreographies/schedule-capacity-occupancy.server";

/**
 * The owner of schedules: their queries, their mutations with or without
 * their capacities inline, and their types. A schedule capacity on its own
 * lives in `capacities.server.ts`, which its callers import directly
 * (PRD #719).
 */

export type ScheduleInput = {
  name: string;
  scheduledDate: string;
  startTime: string;
  /**
   * The award ceremony, a pair: both blank (or absent) is a schedule without
   * one. See `app/lib/schedules/award-ceremony.ts`.
   */
  awardCeremonyDate?: string;
  awardCeremonyTime?: string;
  totalCapacity: number;
  modalityIds: string[];
  /**
   * The categories the schedule accepts. Optional, and an empty list is the
   * meaningful default: the schedule accepts every category, which is what
   * every schedule did before schedules could name categories at all.
   */
  categoryIds?: string[];
};

export type ScheduleWithEntriesInput = ScheduleInput & {
  scheduleCapacities: Array<ScheduleCapacityInput & { id?: string }>;
};

export type ScheduleDependencies = {
  hasDependencies?: (scheduleId: string) => Promise<boolean> | boolean;
};

/**
 * Real occupancy: how many choreographies are assigned and how many places are
 * left. Not to be confused with the sum of the split capacities, which only
 * shares out the total capacity and says nothing about what is already taken.
 */
export type ScheduleOccupancy = {
  availablePlaces: number;
  occupiedCount: number;
};

export type ScheduleAcceptedCategory = Pick<
  typeof categories.$inferSelect,
  "id" | "name" | "minAge" | "maxAge" | "groupTypes"
>;

export type ScheduleCapacityWithOccupancy = ScheduleCapacityListItem &
  ScheduleOccupancy;

export type ScheduleListItem = typeof schedules.$inferSelect &
  ScheduleOccupancy & {
    modalities: Array<Pick<typeof modalities.$inferSelect, "id" | "name">>;
    modalityIds: string[];
    categories: ScheduleAcceptedCategory[];
    categoryIds: string[];
    scheduleCapacities: ScheduleCapacityWithOccupancy[];
  };

type ExistingSchedule = typeof schedules.$inferSelect;

type ScheduleMutationResult = EventBasesMutationResult<ExistingSchedule>;

export async function listSchedules(
  eventId: string,
): Promise<ScheduleListItem[]> {
  const eventSchedules = await db.query.schedules.findMany({
    where: eq(schedules.eventId, eventId),
    orderBy: [
      asc(schedules.scheduledDate),
      asc(schedules.startTime),
      asc(schedules.name),
    ],
  });

  if (eventSchedules.length === 0) {
    return [];
  }

  const scheduleIds = eventSchedules.map((schedule) => schedule.id);
  const [acceptedModalities, acceptedCategories, eventScheduleCapacities] =
    await Promise.all([
      db
        .select({
          scheduleId: scheduleModalities.scheduleId,
          modalityId: modalities.id,
          modalityName: modalities.name,
        })
        .from(scheduleModalities)
        .innerJoin(modalities, eq(scheduleModalities.modalityId, modalities.id))
        .where(inArray(scheduleModalities.scheduleId, scheduleIds))
        .orderBy(asc(modalities.name)),
      listAcceptedCategories(scheduleIds),
      db.query.scheduleCapacities.findMany({
        where: inArray(scheduleCapacities.scheduleId, scheduleIds),
        orderBy: [
          asc(scheduleCapacities.groupType),
          asc(scheduleCapacities.capacity),
        ],
      }),
    ]);

  const modalitiesByScheduleId = groupScheduleModalities(acceptedModalities);
  const categoriesByScheduleId = groupScheduleCategories(acceptedCategories);
  const capacitiesByScheduleId = groupScheduleCapacities(
    eventScheduleCapacities,
  );
  const occupancies = await resolveScheduleCapacityOccupancies({
    targets: [
      ...scheduleIds.map((scheduleId) => ({
        scheduleCapacityId: null,
        scheduleId,
      })),
      ...eventScheduleCapacities.map((scheduleCapacity) => ({
        scheduleCapacityId: scheduleCapacity.id,
        scheduleId: scheduleCapacity.scheduleId,
      })),
    ],
  });

  return eventSchedules.map((schedule) => {
    const scheduleEntries = modalitiesByScheduleId.get(schedule.id) ?? [];
    const scheduleCategoryEntries =
      categoriesByScheduleId.get(schedule.id) ?? [];
    const capacitiesForSchedule = capacitiesByScheduleId.get(schedule.id) ?? [];

    return {
      ...schedule,
      modalities: scheduleEntries,
      modalityIds: scheduleEntries.map((modality) => modality.id),
      categories: scheduleCategoryEntries,
      categoryIds: scheduleCategoryEntries.map((category) => category.id),
      ...toScheduleOccupancy(
        occupancies.get(
          toScheduleCapacityOccupancyKey({
            scheduleCapacityId: null,
            scheduleId: schedule.id,
          }),
        ),
        schedule.totalCapacity,
      ),
      scheduleCapacities: capacitiesForSchedule.map((scheduleCapacity) => ({
        ...scheduleCapacity,
        ...toScheduleOccupancy(
          occupancies.get(
            toScheduleCapacityOccupancyKey({
              scheduleCapacityId: scheduleCapacity.id,
              scheduleId: schedule.id,
            }),
          ),
          scheduleCapacity.capacity,
        ),
      })),
    };
  });
}

/**
 * Places never go below zero: if someone squeezed in an extra choreography or
 * shrank the capacity afterwards, the view reads "sin lugares", not a negative.
 */
function toScheduleOccupancy(
  occupancy: ScheduleCapacityOccupancy | undefined,
  capacity: number,
) {
  const occupiedCount = occupancy?.occupiedCount ?? 0;

  return {
    availablePlaces: Math.max(capacity - occupiedCount, 0),
    occupiedCount,
  };
}

export async function createSchedule(
  eventId: string,
  input: ScheduleInput,
): Promise<ScheduleMutationResult> {
  const validation = await validateScheduleInput(eventId, input);

  if (!validation.ok) {
    return validation;
  }

  return db.transaction(async (tx): Promise<ScheduleMutationResult> => {
    const [record] = await tx
      .insert(schedules)
      .values({
        eventId,
        ...toScheduleColumnValues(validation.input),
      })
      .returning();

    if (!record) {
      return {
        ok: false,
        code: "invalid-event-bases",
        error: "No se pudo guardar el cronograma.",
      };
    }

    await tx
      .insert(scheduleModalities)
      .values(getScheduleModalityValues(record.id, input.modalityIds));
    await insertScheduleCategories(tx, record.id, input.categoryIds);

    return created(record);
  });
}

export async function createScheduleWithEntries(
  eventId: string,
  input: ScheduleWithEntriesInput,
): Promise<ScheduleMutationResult> {
  const validation = await validateScheduleInput(eventId, input);

  if (!validation.ok) {
    return validation;
  }

  const scheduleCapacityValidation =
    await validateInlineScheduleCapacitiesInput({
      scheduleCapacities: input.scheduleCapacities,
      totalCapacity: input.totalCapacity,
    });

  if (!scheduleCapacityValidation.ok) {
    return scheduleCapacityValidation;
  }

  return db.transaction(async (tx): Promise<ScheduleMutationResult> => {
    const [record] = await tx
      .insert(schedules)
      .values({
        eventId,
        ...toScheduleColumnValues(validation.input),
      })
      .returning();

    if (!record) {
      return {
        ok: false,
        code: "invalid-event-bases",
        error: "No se pudo guardar el cronograma.",
      };
    }

    await tx
      .insert(scheduleModalities)
      .values(getScheduleModalityValues(record.id, input.modalityIds));
    await insertScheduleCategories(tx, record.id, input.categoryIds);

    if (scheduleCapacityValidation.entries.length > 0) {
      await tx.insert(scheduleCapacities).values(
        scheduleCapacityValidation.entries.map((entry) => ({
          scheduleId: record.id,
          groupType: entry.groupType,
          capacity: entry.capacity,
        })),
      );
    }

    return created(record);
  });
}

export async function updateSchedule(
  scheduleId: string,
  input: ScheduleInput,
  dependencies: ScheduleDependencies = {},
): Promise<ScheduleMutationResult> {
  const existing = await getSchedule(scheduleId);

  if (!existing) {
    return eventBaseEntityNotFound("schedule");
  }

  const validation = await validateScheduleInput(existing.eventId, input);

  if (!validation.ok) {
    return validation;
  }

  return db.transaction(async (tx): Promise<ScheduleMutationResult> => {
    const structuralFailure = await validateStructuralScheduleChangesLocked(
      tx,
      scheduleId,
      input,
      dependencies,
    );

    if (structuralFailure) {
      return structuralFailure;
    }

    const [record] = await tx
      .update(schedules)
      .set({
        ...toScheduleColumnValues(validation.input),
      })
      .where(eq(schedules.id, scheduleId))
      .returning();

    if (!record) {
      return eventBaseEntityNotFound("schedule");
    }

    await tx
      .delete(scheduleModalities)
      .where(eq(scheduleModalities.scheduleId, scheduleId));
    await tx
      .insert(scheduleModalities)
      .values(getScheduleModalityValues(scheduleId, input.modalityIds));
    await replaceScheduleCategories(tx, scheduleId, input.categoryIds);

    return created(record);
  });
}

export async function updateScheduleWithEntries(
  scheduleId: string,
  input: ScheduleWithEntriesInput,
  dependencies: ScheduleDependencies = {},
): Promise<ScheduleMutationResult> {
  const existing = await getSchedule(scheduleId);

  if (!existing) {
    return eventBaseEntityNotFound("schedule");
  }

  const validation = await validateScheduleInput(existing.eventId, input);

  if (!validation.ok) {
    return validation;
  }

  const existingEntries = await db.query.scheduleCapacities.findMany({
    where: eq(scheduleCapacities.scheduleId, scheduleId),
  });
  const scheduleCapacityValidation =
    await validateInlineScheduleCapacitiesInput({
      existingEntries,
      scheduleCapacities: input.scheduleCapacities,
      totalCapacity: input.totalCapacity,
    });

  if (!scheduleCapacityValidation.ok) {
    return scheduleCapacityValidation;
  }

  const scheduleCapacityDependencyValidation =
    await validateInlineScheduleCapacityDependencies({
      existingEntries,
      nextEntries: scheduleCapacityValidation.entries,
    });

  if (!scheduleCapacityDependencyValidation.ok) {
    return scheduleCapacityDependencyValidation;
  }

  return db.transaction(async (tx): Promise<ScheduleMutationResult> => {
    const structuralFailure = await validateStructuralScheduleChangesLocked(
      tx,
      scheduleId,
      input,
      dependencies,
    );

    if (structuralFailure) {
      return structuralFailure;
    }

    const [record] = await tx
      .update(schedules)
      .set({
        ...toScheduleColumnValues(validation.input),
      })
      .where(eq(schedules.id, scheduleId))
      .returning();

    if (!record) {
      return eventBaseEntityNotFound("schedule");
    }

    await tx
      .delete(scheduleModalities)
      .where(eq(scheduleModalities.scheduleId, scheduleId));
    await tx
      .insert(scheduleModalities)
      .values(getScheduleModalityValues(scheduleId, input.modalityIds));
    await replaceScheduleCategories(tx, scheduleId, input.categoryIds);

    const nextEntries = scheduleCapacityValidation.entries;
    const nextIds = new Set(
      nextEntries
        .map((entry) => entry.id)
        .filter((id): id is string => Boolean(id)),
    );
    const entryIdsToDelete = existingEntries
      .map((entry) => entry.id)
      .filter((entryId) => !nextIds.has(entryId));

    if (entryIdsToDelete.length > 0) {
      await releaseScheduleCapacityReferences(tx, entryIdsToDelete);
      await tx
        .delete(scheduleCapacities)
        .where(inArray(scheduleCapacities.id, entryIdsToDelete));
    }

    for (const entry of nextEntries) {
      if (entry.id) {
        await tx
          .update(scheduleCapacities)
          .set({
            groupType: entry.groupType,
            capacity: entry.capacity,
          })
          .where(eq(scheduleCapacities.id, entry.id));
        continue;
      }

      await tx.insert(scheduleCapacities).values({
        scheduleId,
        groupType: entry.groupType,
        capacity: entry.capacity,
      });
    }

    return created(record);
  });
}

export async function deleteSchedule(
  scheduleId: string,
  dependencies: ScheduleDependencies = {},
): Promise<EventBasesDeleteResult> {
  const schedule = await db.query.schedules.findFirst({
    where: eq(schedules.id, scheduleId),
  });

  if (!schedule) {
    return eventBaseEntityNotFound("schedule");
  }

  const hasDependencies = dependencies.hasDependencies ?? scheduleIsReferenced;

  if (await hasDependencies(scheduleId)) {
    return {
      ok: false,
      code: "schedule-has-dependencies",
      error: (await scheduleIsHeldOnlyByWithdrawnChoreographies(scheduleId))
        ? "No se puede eliminar el cronograma porque tiene coreografías retiradas asignadas."
        : "No se puede eliminar el cronograma porque tiene dependencias.",
    };
  }

  // Its capacities go with it (`schedule_capacity_schedule_fk` cascades):
  // with no choreography on the schedule, none can occupy them.
  await db.delete(schedules).where(eq(schedules.id, scheduleId));

  return { ok: true };
}

/**
 * Whether the refusal above is about withdrawn choreographies and nothing else.
 * A withdrawn choreography holds no place, so an admin who freed the schedule
 * would otherwise read "tiene dependencias" over a block that looks empty
 * everywhere else; naming them is the only way the refusal points at something
 * findable.
 */
async function scheduleIsHeldOnlyByWithdrawnChoreographies(scheduleId: string) {
  if (await scheduleHasOperationalDependencies(scheduleId)) {
    return false;
  }

  return hasReferencingChoreographies(
    eq(choreographies.scheduleId, scheduleId),
  );
}

/**
 * The delete counterpart of `scheduleHasOperationalDependencies`
 * (`schedule-structure.server.ts`). Restructuring only has to refuse
 * while the schedule is occupied —a withdrawn choreography holds no place— but
 * a delete has to refuse whenever any choreography points at it, withdrawn
 * included: `choreography.schedule_id` carries no `on delete` behaviour and is
 * not nullable either, so unlike the capacity reference it cannot be released
 * before the delete, and without this guard the caller would get a raw driver
 * error instead of a typed failure.
 */
async function scheduleIsReferenced(scheduleId: string) {
  if (await isScheduleCoveredByPrice(db, scheduleId)) {
    return true;
  }

  return hasReferencingChoreographies(
    eq(choreographies.scheduleId, scheduleId),
  );
}

async function validateScheduleInput(
  eventId: string,
  input: ScheduleInput,
): Promise<
  { ok: true; input: ScheduleInput & { name: string } } | EventBaseFailure
> {
  const fieldErrors: Record<string, string> = {};
  const name = toTitleCase(input.name);

  if (name.length === 0) {
    fieldErrors.name = requiredFieldMessage;
  }

  Object.assign(fieldErrors, validateScheduleTimingInput(input));

  if (!Number.isInteger(input.totalCapacity) || input.totalCapacity <= 0) {
    fieldErrors.totalCapacity = "Ingresá un cupo total mayor a cero.";
  }

  Object.assign(fieldErrors, await validateAcceptedBasesInput(eventId, input));

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      code: "invalid-event-bases",
      error: eventBaseCopy.schedule.invalidError,
      fieldErrors,
    };
  }

  return { ok: true, input: { ...input, name } };
}

/**
 * The field errors of the modalities and categories the schedule accepts: at
 * least one modality, all of the event, and categories that share one of them.
 */
async function validateAcceptedBasesInput(
  eventId: string,
  input: ScheduleInput,
): Promise<Record<string, string>> {
  const fieldErrors: Record<string, string> = {};
  const modalityIds = uniqueValues(input.modalityIds);

  if (modalityIds.length === 0) {
    fieldErrors.modalityIds = requiredFieldMessage;
  } else {
    const validModalities = await db
      .select({ id: modalities.id })
      .from(modalities)
      .where(
        and(
          eq(modalities.eventId, eventId),
          inArray(modalities.id, modalityIds),
        ),
      );

    if (validModalities.length !== modalityIds.length) {
      fieldErrors.modalityIds = "Elegí modalidades del evento activo.";
    }
  }

  const categoryIds = uniqueValues(input.categoryIds ?? []);

  if (
    categoryIds.length > 0 &&
    !(await everyCategorySharesAModality({ categoryIds, eventId, modalityIds }))
  ) {
    fieldErrors.categoryIds =
      "Elegí categorías que compartan una modalidad con el cronograma.";
  }

  return fieldErrors;
}

async function getSchedule(scheduleId: string) {
  return db.query.schedules.findFirst({
    where: eq(schedules.id, scheduleId),
  });
}

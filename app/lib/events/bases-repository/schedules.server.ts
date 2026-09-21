import { and, asc, eq, inArray } from "drizzle-orm";

import {
  choreographies,
  created,
  db,
  eventBaseEntityNotFound,
  hasOccupyingChoreographies,
  hasReferencingChoreographies,
  isValidDate,
  isValidTime,
  modalities,
  normalizeTime,
  prices,
  requiredFieldMessage,
  scheduleCapacities,
  scheduleModalities,
  schedules,
  sortedIds,
  toTitleCase,
  uniqueValues,
} from "@/lib/events/bases-repository/shared.server";
import type {
  EventBaseFailure,
  EventBasesDeleteResult,
  EventBasesMutationResult,
  ScheduleDependencies,
  ScheduleInput,
  ScheduleListItem,
  ScheduleWithEntriesInput,
} from "@/lib/events/bases-repository/shared.server";
import {
  acceptsEveryCategory,
  groupScheduleCategories,
  insertScheduleCategories,
  listAcceptedCategories,
  replaceScheduleCategories,
} from "@/lib/events/bases-repository/schedule-categories.server";
import {
  groupScheduleCapacities,
  releaseScheduleCapacityReferences,
  validateInlineScheduleCapacitiesInput,
  validateInlineScheduleCapacityDependencies,
} from "@/lib/events/bases-repository/schedule-capacities.server";
import {
  resolveOccupiedCounts,
  resolveScheduleCapacityOccupancies,
  toScheduleCapacityOccupancyKey,
  type ScheduleCapacityOccupancy,
} from "@/lib/choreographies/schedule-capacity-occupancy.server";

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
): Promise<EventBasesMutationResult> {
  const validation = await validateScheduleInput(eventId, input);

  if (!validation.ok) {
    return validation;
  }

  return db.transaction(async (tx): Promise<EventBasesMutationResult> => {
    const [record] = await tx
      .insert(schedules)
      .values({
        eventId,
        name: validation.input.name,
        scheduledDate: input.scheduledDate,
        startTime: normalizeTime(input.startTime),
        totalCapacity: input.totalCapacity,
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
): Promise<EventBasesMutationResult> {
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

  return db.transaction(async (tx): Promise<EventBasesMutationResult> => {
    const [record] = await tx
      .insert(schedules)
      .values({
        eventId,
        name: validation.input.name,
        scheduledDate: input.scheduledDate,
        startTime: normalizeTime(input.startTime),
        totalCapacity: input.totalCapacity,
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
): Promise<EventBasesMutationResult> {
  const existing = await getScheduleWithModalityIds(scheduleId);

  if (!existing) {
    return eventBaseEntityNotFound("schedule");
  }

  const validation = await validateScheduleInput(existing.eventId, input);

  if (!validation.ok) {
    return validation;
  }

  const structuralFailure = await validateStructuralScheduleChanges(
    existing,
    input,
    dependencies.hasDependencies ?? scheduleHasOperationalDependencies,
  );

  if (structuralFailure) {
    return structuralFailure;
  }

  return db.transaction(async (tx): Promise<EventBasesMutationResult> => {
    const [record] = await tx
      .update(schedules)
      .set({
        name: validation.input.name,
        scheduledDate: input.scheduledDate,
        startTime: normalizeTime(input.startTime),
        totalCapacity: input.totalCapacity,
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
): Promise<EventBasesMutationResult> {
  const existing = await getScheduleWithModalityIds(scheduleId);

  if (!existing) {
    return eventBaseEntityNotFound("schedule");
  }

  const validation = await validateScheduleInput(existing.eventId, input);

  if (!validation.ok) {
    return validation;
  }

  const structuralFailure = await validateStructuralScheduleChanges(
    existing,
    input,
    dependencies.hasDependencies ?? scheduleHasOperationalDependencies,
  );

  if (structuralFailure) {
    return structuralFailure;
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

  return db.transaction(async (tx): Promise<EventBasesMutationResult> => {
    const [record] = await tx
      .update(schedules)
      .set({
        name: validation.input.name,
        scheduledDate: input.scheduledDate,
        startTime: normalizeTime(input.startTime),
        totalCapacity: input.totalCapacity,
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
        ? "No se puede borrar el cronograma porque tiene coreografías retiradas asignadas."
        : "No se puede borrar el cronograma porque tiene dependencias.",
    };
  }

  if (await scheduleHasScheduleCapacities(scheduleId)) {
    return {
      ok: false,
      code: "schedule-has-dependencies",
      error:
        "No se puede borrar el cronograma porque tiene cupos de cronograma relacionados.",
    };
  }

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

async function scheduleHasOperationalDependencies(scheduleId: string) {
  const price = await db.query.prices.findFirst({
    columns: { id: true },
    where: eq(prices.scheduleId, scheduleId),
  });

  if (price) {
    return true;
  }

  return hasOccupyingChoreographies(eq(choreographies.scheduleId, scheduleId));
}

/**
 * The delete counterpart of the guard above. Restructuring only has to refuse
 * while the schedule is occupied —a withdrawn choreography holds no place— but
 * a delete has to refuse whenever any choreography points at it, withdrawn
 * included: `choreography.schedule_id` carries no `on delete` behaviour and is
 * not nullable either, so unlike the capacity reference it cannot be released
 * before the delete, and without this guard the caller would get a raw driver
 * error instead of a typed failure.
 */
async function scheduleIsReferenced(scheduleId: string) {
  const price = await db.query.prices.findFirst({
    where: eq(prices.scheduleId, scheduleId),
  });

  if (price) {
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

  if (input.scheduledDate.trim().length === 0) {
    fieldErrors.scheduledDate = requiredFieldMessage;
  } else if (!isValidDate(input.scheduledDate)) {
    fieldErrors.scheduledDate = "Ingresá una fecha válida.";
  }

  if (input.startTime.trim().length === 0) {
    fieldErrors.startTime = requiredFieldMessage;
  } else if (!isValidTime(input.startTime)) {
    fieldErrors.startTime = "Ingresá una hora válida.";
  }

  if (!Number.isInteger(input.totalCapacity) || input.totalCapacity <= 0) {
    fieldErrors.totalCapacity = "Ingresá un cupo total mayor a cero.";
  }

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
    !(await acceptsEveryCategory({ categoryIds, eventId, modalityIds }))
  ) {
    fieldErrors.categoryIds =
      "Elegí categorías que compartan una modalidad con el cronograma.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      code: "invalid-event-bases",
      error: "Revisá los datos del cronograma.",
      fieldErrors,
    };
  }

  return { ok: true, input: { ...input, name } };
}

async function getScheduleWithModalityIds(scheduleId: string) {
  const schedule = await db.query.schedules.findFirst({
    where: eq(schedules.id, scheduleId),
  });

  if (!schedule) {
    return null;
  }

  const acceptedModalities = await db.query.scheduleModalities.findMany({
    columns: { modalityId: true },
    where: eq(scheduleModalities.scheduleId, scheduleId),
  });

  return {
    ...schedule,
    modalityIds: acceptedModalities.map((modality) => modality.modalityId),
  };
}

async function scheduleHasScheduleCapacities(scheduleId: string) {
  const scheduleCapacity = await db.query.scheduleCapacities.findFirst({
    columns: { id: true },
    where: eq(scheduleCapacities.scheduleId, scheduleId),
  });

  return Boolean(scheduleCapacity);
}

/**
 * Date, time and accepted modalities freeze once the schedule has dependencies:
 * choreographies were placed and priced against them. The total capacity does
 * not — it may move freely as long as it still holds what already occupies the
 * schedule, which is the only thing a smaller number could break.
 */
async function validateStructuralScheduleChanges(
  existing: ExistingSchedule,
  input: ScheduleInput,
  hasDependencies: (scheduleId: string) => boolean | Promise<boolean>,
): Promise<EventBaseFailure | null> {
  if (
    hasFrozenScheduleChanges(existing, input) &&
    (await hasDependencies(existing.id))
  ) {
    return {
      ok: false,
      code: "schedule-has-dependencies",
      error:
        "No se pueden editar fecha, hora ni modalidades aceptadas porque el cronograma tiene dependencias.",
    };
  }

  if (existing.totalCapacity === input.totalCapacity) {
    return null;
  }

  const occupiedCount = await getScheduleOccupiedCount(existing.id);

  if (input.totalCapacity < occupiedCount) {
    return {
      ok: false,
      code: "schedule-has-dependencies",
      error: `El cupo total no puede ser menor a los ${occupiedCount} lugares ya ocupados del cronograma.`,
      fieldErrors: { totalCapacity: "Ajustá el cupo." },
    };
  }

  return null;
}

async function getScheduleOccupiedCount(scheduleId: string) {
  const target = { scheduleCapacityId: null, scheduleId };
  const readOccupiedCount = await resolveOccupiedCounts([target]);

  return readOccupiedCount(target);
}

type ExistingSchedule = typeof schedules.$inferSelect & {
  modalityIds: string[];
};

function hasFrozenScheduleChanges(
  existing: ExistingSchedule,
  input: ScheduleInput,
) {
  return (
    existing.scheduledDate !== input.scheduledDate ||
    existing.startTime !== normalizeTime(input.startTime) ||
    sortedIds(existing.modalityIds).join("\0") !==
      sortedIds(input.modalityIds).join("\0")
  );
}

function getScheduleModalityValues(scheduleId: string, modalityIds: string[]) {
  return uniqueValues(modalityIds).map((modalityId) => ({
    scheduleId,
    modalityId,
  }));
}

function groupScheduleModalities(
  acceptedModalities: Array<{
    scheduleId: string;
    modalityId: string;
    modalityName: string;
  }>,
) {
  const modalitiesByScheduleId = new Map<
    string,
    Array<Pick<typeof modalities.$inferSelect, "id" | "name">>
  >();

  for (const modality of acceptedModalities) {
    const scheduleEntries =
      modalitiesByScheduleId.get(modality.scheduleId) ?? [];

    scheduleEntries.push({
      id: modality.modalityId,
      name: modality.modalityName,
    });
    modalitiesByScheduleId.set(modality.scheduleId, scheduleEntries);
  }

  return modalitiesByScheduleId;
}

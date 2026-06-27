import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";

import {
  created,
  db,
  isGroupType,
  requiredFieldMessage,
  scheduleCapacities,
  scheduleCapacityNotFound,
  scheduleModalities,
  schedules,
} from "@/lib/events/bases-repository/shared.server";
import type {
  CompatibleScheduleCapacity,
  CompatibleScheduleCapacityResolution,
  CompatibleScheduleRow,
  EventBaseFailure,
  EventBasesDeleteResult,
  EventBasesMutationResult,
  GroupType,
  ScheduleCapacityDependencies,
  ScheduleCapacityInput,
  ScheduleCapacityListItem,
  ValidInlineScheduleCapacityInput,
} from "@/lib/events/bases-repository/shared.server";

export async function createScheduleCapacity(
  scheduleId: string,
  input: ScheduleCapacityInput,
): Promise<EventBasesMutationResult> {
  const validation = await validateScheduleCapacityInput(scheduleId, input);

  if (!validation.ok) {
    return validation;
  }

  const [record] = await db
    .insert(scheduleCapacities)
    .values({
      scheduleId,
      groupType: validation.groupType,
      capacity: input.capacity,
    })
    .returning();

  return created(record);
}

export async function updateScheduleCapacity(
  scheduleCapacityId: string,
  input: ScheduleCapacityInput,
  dependencies: ScheduleCapacityDependencies = {},
): Promise<EventBasesMutationResult> {
  const existing = await db.query.scheduleCapacities.findFirst({
    where: eq(scheduleCapacities.id, scheduleCapacityId),
  });

  if (!existing) {
    return scheduleCapacityNotFound();
  }

  const validation = await validateScheduleCapacityInput(
    existing.scheduleId,
    input,
    scheduleCapacityId,
  );

  if (!validation.ok) {
    return validation;
  }

  const hasDependencies =
    dependencies.hasDependencies ?? scheduleCapacityHasOperationalDependencies;

  if (
    (await hasDependencies(scheduleCapacityId)) &&
    hasStructuralScheduleCapacityChanges(existing, {
      groupType: validation.groupType,
      capacity: input.capacity,
    })
  ) {
    return {
      ok: false,
      code: "invalid-schedule-capacity",
      error:
        "No se pueden editar tipos de grupo ni cupo porque el cupo de cronograma tiene dependencias.",
    };
  }

  const [record] = await db
    .update(scheduleCapacities)
    .set({
      groupType: validation.groupType,
      capacity: input.capacity,
    })
    .where(eq(scheduleCapacities.id, scheduleCapacityId))
    .returning();

  return created(record);
}

export async function deleteScheduleCapacity(
  scheduleCapacityId: string,
  dependencies: ScheduleCapacityDependencies = {},
): Promise<EventBasesDeleteResult> {
  const scheduleCapacity = await db.query.scheduleCapacities.findFirst({
    where: eq(scheduleCapacities.id, scheduleCapacityId),
  });

  if (!scheduleCapacity) {
    return scheduleCapacityNotFound();
  }

  const hasDependencies =
    dependencies.hasDependencies ?? scheduleCapacityHasOperationalDependencies;

  if (await hasDependencies(scheduleCapacityId)) {
    return {
      ok: false,
      code: "invalid-schedule-capacity",
      error:
        "No se puede borrar el cupo de cronograma porque tiene dependencias.",
    };
  }

  await db
    .delete(scheduleCapacities)
    .where(eq(scheduleCapacities.id, scheduleCapacityId));

  return { ok: true };
}

async function scheduleCapacityHasOperationalDependencies(
  _scheduleCapacityId: string,
) {
  return false;
}

export async function resolveCompatibleScheduleCapacities(input: {
  eventId: string;
  modalityId: string;
  groupType: string;
}): Promise<CompatibleScheduleCapacityResolution> {
  if (!isGroupType(input.groupType)) {
    return {
      status: "none",
      error: "Elegí un tipo de grupo válido.",
      options: [],
    };
  }

  const compatibleOptions = await findCompatibleScheduleCapacities({
    eventId: input.eventId,
    modalityId: input.modalityId,
    groupType: input.groupType,
  });

  if (compatibleOptions.length === 0) {
    return {
      status: "none",
      error:
        "No hay cupos de cronograma compatibles para la modalidad y el tipo de grupo seleccionados.",
      options: [],
    };
  }

  if (compatibleOptions.length === 1) {
    return {
      status: "auto",
      scheduleCapacity: compatibleOptions[0],
      options: [compatibleOptions[0]],
    };
  }

  return {
    status: "multiple",
    options: compatibleOptions,
  };
}

export async function validateInlineScheduleCapacitiesInput({
  existingEntries = [],
  scheduleCapacities: inputEntries,
  totalCapacity,
}: {
  existingEntries?: Array<typeof scheduleCapacities.$inferSelect>;
  scheduleCapacities: Array<ScheduleCapacityInput & { id?: string }>;
  totalCapacity: number;
}): Promise<
  { ok: true; entries: ValidInlineScheduleCapacityInput[] } | EventBaseFailure
> {
  const fieldErrors: Record<string, string> = {};
  const existingEntryIds = new Set(existingEntries.map((entry) => entry.id));
  const firstIndexByGroupType = new Map<string, number>();
  const entries = inputEntries.map((entry, index) => {
    const groupType = isGroupType(entry.groupType) ? entry.groupType : null;

    if (entry.id && !existingEntryIds.has(entry.id)) {
      fieldErrors[`scheduleCapacities.${index}.groupType`] =
        "No encontramos ese cupo de cronograma en el cronograma.";
    }

    if (!groupType) {
      fieldErrors[`scheduleCapacities.${index}.groupType`] =
        requiredFieldMessage;
    }

    if (!Number.isInteger(entry.capacity) || entry.capacity <= 0) {
      fieldErrors[`scheduleCapacities.${index}.capacity`] =
        "Ingresá un cupo mayor a cero.";
    }

    if (groupType) {
      const firstIndex = firstIndexByGroupType.get(groupType);

      if (firstIndex === undefined) {
        firstIndexByGroupType.set(groupType, index);
      } else {
        fieldErrors[`scheduleCapacities.${firstIndex}.groupType`] =
          "Revisá el tipo de grupo del cupo de cronograma.";
        fieldErrors[`scheduleCapacities.${index}.groupType`] =
          "Ya existe un cupo de cronograma para ese tipo de grupo.";
      }
    }

    return {
      id: entry.id,
      index,
      groupType: groupType ?? "solo",
      capacity: entry.capacity,
    };
  });
  const totalReservedCapacity = entries.reduce(
    (total, entry) =>
      Number.isInteger(entry.capacity) && entry.capacity > 0
        ? total + entry.capacity
        : total,
    0,
  );

  if (totalReservedCapacity > totalCapacity) {
    for (const entry of entries) {
      fieldErrors[`scheduleCapacities.${entry.index}.capacity`] =
        "Ajustá el cupo.";
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      code: "invalid-schedule-capacity",
      error: "Revisá los datos del cupo de cronograma.",
      fieldErrors,
    };
  }

  return { ok: true, entries };
}

export async function validateInlineScheduleCapacityDependencies({
  existingEntries,
  nextEntries,
}: {
  existingEntries: Array<typeof scheduleCapacities.$inferSelect>;
  nextEntries: ValidInlineScheduleCapacityInput[];
}): Promise<{ ok: true } | EventBaseFailure> {
  const nextEntryById = new Map(
    nextEntries.filter(hasScheduleCapacityId).map((entry) => [entry.id, entry]),
  );

  for (const existingEntry of existingEntries) {
    const nextEntry = nextEntryById.get(existingEntry.id);
    const hasDependencies = await scheduleCapacityHasOperationalDependencies(
      existingEntry.id,
    );

    if (!nextEntry) {
      if (hasDependencies) {
        return {
          ok: false,
          code: "invalid-schedule-capacity",
          error:
            "No se puede borrar el cupo de cronograma porque tiene dependencias.",
        };
      }

      continue;
    }

    if (
      hasDependencies &&
      hasStructuralScheduleCapacityChanges(existingEntry, {
        groupType: nextEntry.groupType,
        capacity: nextEntry.capacity,
      })
    ) {
      return {
        ok: false,
        code: "invalid-schedule-capacity",
        error:
          "No se pueden editar tipos de grupo ni cupo porque el cupo de cronograma tiene dependencias.",
      };
    }
  }

  return { ok: true };
}

function hasScheduleCapacityId(
  entry: ValidInlineScheduleCapacityInput,
): entry is ValidInlineScheduleCapacityInput & { id: string } {
  return Boolean(entry.id);
}

export function groupScheduleCapacities(
  capacities: ScheduleCapacityListItem[],
) {
  const capacitiesByScheduleId = new Map<string, ScheduleCapacityListItem[]>();

  for (const capacity of capacities) {
    const scheduleEntries =
      capacitiesByScheduleId.get(capacity.scheduleId) ?? [];

    scheduleEntries.push(capacity);
    capacitiesByScheduleId.set(capacity.scheduleId, scheduleEntries);
  }

  return capacitiesByScheduleId;
}

async function validateScheduleCapacityInput(
  scheduleId: string,
  input: ScheduleCapacityInput,
  exceptId?: string,
): Promise<{ ok: true; groupType: GroupType } | EventBaseFailure> {
  const schedule = await db.query.schedules.findFirst({
    where: eq(schedules.id, scheduleId),
  });

  if (!schedule) {
    return scheduleCapacityNotFound();
  }

  const fieldErrors: Record<string, string> = {};
  const groupType = isGroupType(input.groupType) ? input.groupType : null;

  if (!groupType) {
    fieldErrors.groupType = requiredFieldMessage;
  }

  if (!Number.isInteger(input.capacity) || input.capacity <= 0) {
    fieldErrors.capacity = "Ingresá un cupo mayor a cero.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      code: "invalid-schedule-capacity",
      error: "Revisá los datos del cupo de cronograma.",
      fieldErrors,
    };
  }

  if (
    groupType &&
    (await findDuplicateScheduleCapacity(scheduleId, groupType, exceptId))
  ) {
    return {
      ok: false,
      code: "invalid-schedule-capacity",
      error:
        "Ya existe un cupo de cronograma para ese tipo de grupo en este cronograma.",
      fieldErrors: {
        groupType: "Revisá el tipo de grupo del cupo de cronograma.",
      },
    };
  }

  const reservedCapacity = await getReservedScheduleCapacityCapacity(
    scheduleId,
    exceptId,
  );

  if (reservedCapacity + input.capacity > schedule.totalCapacity) {
    return {
      ok: false,
      code: "invalid-schedule-capacity",
      error:
        "La suma de cupos de cronograma no puede superar el cupo total del cronograma.",
      fieldErrors: { capacity: "Ajustá el cupo." },
    };
  }

  return { ok: true, groupType: groupType ?? "solo" };
}

async function findCompatibleScheduleCapacities(input: {
  eventId: string;
  modalityId: string;
  groupType: GroupType;
}): Promise<CompatibleScheduleCapacity[]> {
  const compatibleSchedules = await db
    .select({
      id: schedules.id,
      name: schedules.name,
      scheduledDate: schedules.scheduledDate,
      startTime: schedules.startTime,
      totalCapacity: schedules.totalCapacity,
      createdAt: schedules.createdAt,
    })
    .from(schedules)
    .innerJoin(
      scheduleModalities,
      eq(schedules.id, scheduleModalities.scheduleId),
    )
    .where(
      and(
        eq(schedules.eventId, input.eventId),
        eq(scheduleModalities.modalityId, input.modalityId),
      ),
    )
    .orderBy(asc(schedules.scheduledDate), asc(schedules.startTime));

  if (compatibleSchedules.length === 0) {
    return [];
  }

  const specificCapacities = await db.query.scheduleCapacities.findMany({
    where: and(
      inArray(
        scheduleCapacities.scheduleId,
        compatibleSchedules.map((schedule) => schedule.id),
      ),
      eq(scheduleCapacities.groupType, input.groupType),
    ),
  });
  const specificCapacityByScheduleId = new Map(
    specificCapacities.map((capacity) => [capacity.scheduleId, capacity]),
  );

  return compatibleSchedules.map((schedule) => {
    const specificCapacity = specificCapacityByScheduleId.get(schedule.id);

    return specificCapacity
      ? toSpecificCompatibleScheduleCapacity(schedule, specificCapacity)
      : toGlobalCompatibleScheduleCapacity(schedule, input.groupType);
  });
}

function toSpecificCompatibleScheduleCapacity(
  schedule: CompatibleScheduleRow,
  capacity: typeof scheduleCapacities.$inferSelect,
): CompatibleScheduleCapacity {
  return {
    id: capacity.id,
    scheduleId: schedule.id,
    scheduleCapacityId: capacity.id,
    groupType: capacity.groupType,
    capacity: capacity.capacity,
    createdAt: capacity.createdAt,
    usesGlobalCapacity: false,
    schedule: {
      id: schedule.id,
      name: schedule.name,
      scheduledDate: schedule.scheduledDate,
      startTime: schedule.startTime,
    },
  };
}

function toGlobalCompatibleScheduleCapacity(
  schedule: CompatibleScheduleRow,
  groupType: GroupType,
): CompatibleScheduleCapacity {
  return {
    id: getGlobalScheduleCapacityOptionId(schedule.id),
    scheduleId: schedule.id,
    scheduleCapacityId: null,
    groupType,
    capacity: schedule.totalCapacity,
    createdAt: schedule.createdAt,
    usesGlobalCapacity: true,
    schedule: {
      id: schedule.id,
      name: schedule.name,
      scheduledDate: schedule.scheduledDate,
      startTime: schedule.startTime,
    },
  };
}

function getGlobalScheduleCapacityOptionId(scheduleId: string) {
  return `schedule:${scheduleId}:global`;
}

async function findDuplicateScheduleCapacity(
  scheduleId: string,
  groupType: GroupType,
  exceptId?: string,
) {
  const idFilter = exceptId ? ne(scheduleCapacities.id, exceptId) : undefined;

  return db
    .select({ id: scheduleCapacities.id })
    .from(scheduleCapacities)
    .where(
      and(
        eq(scheduleCapacities.scheduleId, scheduleId),
        eq(scheduleCapacities.groupType, groupType),
        idFilter,
      ),
    )
    .limit(1)
    .then(([record]) => record);
}

async function getReservedScheduleCapacityCapacity(
  scheduleId: string,
  exceptId?: string,
) {
  const idFilter = exceptId ? ne(scheduleCapacities.id, exceptId) : undefined;
  const [result] = await db
    .select({
      total: sql<number>`coalesce(sum(${scheduleCapacities.capacity}), 0)::int`,
    })
    .from(scheduleCapacities)
    .where(and(eq(scheduleCapacities.scheduleId, scheduleId), idFilter));

  return result?.total ?? 0;
}

function hasStructuralScheduleCapacityChanges(
  existing: typeof scheduleCapacities.$inferSelect,
  input: { groupType: GroupType; capacity: number },
) {
  return (
    existing.groupType !== input.groupType ||
    existing.capacity !== input.capacity
  );
}

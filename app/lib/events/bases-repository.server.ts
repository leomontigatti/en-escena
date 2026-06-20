import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  categories,
  categoryExperienceLevels,
  categoryModalities,
  experienceLevels,
  modalities,
  prices,
  scheduleCapacities,
  scheduleModalities,
  schedules,
  submodalities,
} from "@/db/schema";
import { requiredFieldMessage } from "@/lib/shared/forms";
import { toTitleCase } from "@/lib/shared/text-normalization";

type EventBaseEntityKind =
  | "modality"
  | "submodality"
  | "experience-level"
  | "schedule";
type GroupType = "solo" | "duo" | "trio" | "grupal";
const groupTypeOrder: GroupType[] = ["solo", "duo", "trio", "grupal"];

type EventBaseRecord =
  | typeof modalities.$inferSelect
  | typeof scheduleCapacities.$inferSelect
  | typeof schedules.$inferSelect
  | typeof submodalities.$inferSelect
  | typeof experienceLevels.$inferSelect
  | typeof categories.$inferSelect
  | typeof prices.$inferSelect;

type EventBaseSuccess = {
  ok: true;
  record: EventBaseRecord;
};

type EventBaseFailure = {
  ok: false;
  code:
    | "event-bases-has-dependencies"
    | "event-bases-not-found"
    | "duplicate-name"
    | "duplicate-category"
    | "invalid-event-bases"
    | "invalid-experience-level"
    | "invalid-group-type"
    | "invalid-modality"
    | "missing-price"
    | "invalid-schedule-capacity"
    | "schedule-has-dependencies";
  error: string;
  fieldErrors?: Record<string, string>;
};

export type EventBasesMutationResult = EventBaseSuccess | EventBaseFailure;
export type EventBasesDeleteResult = { ok: true } | EventBaseFailure;

type EventBaseNameInput = {
  name: string;
};

type SubmodalityInput = EventBaseNameInput & {
  modalityId: string;
};

type InlineSubmodalityInput = EventBaseNameInput & {
  id?: string;
};

export type ModalityWithSubmodalitiesInput = EventBaseNameInput & {
  submodalities: InlineSubmodalityInput[];
};

type CategoryInput = EventBaseNameInput & {
  minAge: number;
  maxAge: number;
  groupTypes: string[];
  modalityIds: string[];
  experienceLevelIds: string[];
};

type ValidCategoryInput = {
  name: string;
  minAge: number;
  maxAge: number;
  groupTypes: GroupType[];
  modalityIds: string[];
  experienceLevelIds: string[];
  groupTypeKey: string;
  experienceLevelKey: string;
};

type InlineScheduleCapacityInput = ScheduleCapacityInput & {
  id?: string;
};

type ValidInlineScheduleCapacityInput = {
  id?: string;
  index: number;
  groupType: GroupType;
  capacity: number;
};

type ValidInlineSubmodalityInput = InlineSubmodalityInput & {
  index: number;
};

type CategoryRelationRow = {
  categoryId: string;
};

type CompatibleScheduleRow = Pick<
  typeof schedules.$inferSelect,
  "id" | "name" | "scheduledDate" | "startTime" | "totalCapacity" | "createdAt"
>;

type EventBasesTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

export type ScheduleInput = EventBaseNameInput & {
  scheduledDate: string;
  startTime: string;
  totalCapacity: number;
  modalityIds: string[];
};

type ValidScheduleInput = ScheduleInput & {
  name: string;
};

export type ScheduleCapacityInput = {
  groupType: string;
  capacity: number;
};

export type ScheduleWithEntriesInput = ScheduleInput & {
  scheduleCapacities: Array<ScheduleCapacityInput & { id?: string }>;
};

type ScheduleDependencies = {
  hasDependencies?: (scheduleId: string) => Promise<boolean> | boolean;
};

type ScheduleCapacityDependencies = {
  hasDependencies?: (scheduleCapacityId: string) => Promise<boolean> | boolean;
};

export type ScheduleListItem = typeof schedules.$inferSelect & {
  modalities: Array<Pick<typeof modalities.$inferSelect, "id" | "name">>;
  modalityIds: string[];
  occupiedCapacity: number;
  scheduleCapacities: ScheduleCapacityListItem[];
};

export type ScheduleCapacityListItem = typeof scheduleCapacities.$inferSelect;

export type CompatibleScheduleCapacityResolution =
  | {
      status: "none";
      error: string;
      options: [];
    }
  | {
      status: "auto";
      scheduleCapacity: CompatibleScheduleCapacity;
      options: [CompatibleScheduleCapacity];
    }
  | {
      status: "multiple";
      options: CompatibleScheduleCapacity[];
    };

export type CompatibleScheduleCapacity = {
  id: string;
  scheduleId: string;
  scheduleCapacityId: string | null;
  groupType: GroupType;
  capacity: number;
  createdAt: Date;
  usesGlobalCapacity: boolean;
  schedule: Pick<
    typeof schedules.$inferSelect,
    "id" | "name" | "scheduledDate" | "startTime"
  >;
};

export type PriceInput = {
  groupType: string;
  amount: number;
  paymentDeadline: string;
  scheduleId: string | null;
};

type ValidPriceInput = {
  groupType: GroupType;
  amount: number;
  paymentDeadline: string;
  scheduleId: string | null;
};

type PriceDependencies = {
  hasDependencies?: (priceId: string) => Promise<boolean> | boolean;
};

export type PriceListItem = typeof prices.$inferSelect & {
  schedule: Pick<
    typeof schedules.$inferSelect,
    "id" | "name" | "scheduledDate" | "startTime"
  > | null;
};

export type PriceResolutionResult =
  | { ok: true; price: typeof prices.$inferSelect }
  | {
      ok: false;
      code: "missing-price" | "invalid-group-type";
      error: string;
    };

const eventBaseCopy = {
  modality: {
    label: "modalidad",
    invalidError: "Revisá los datos de la modalidad.",
    requiredNameError: "Ingresá el nombre de la modalidad.",
    duplicateError: "Ya existe una modalidad con ese nombre en este evento.",
    duplicateFieldError: "Usá un nombre distinto para la modalidad.",
  },
  submodality: {
    label: "submodalidad",
    invalidError: "Revisá los datos de la submodalidad.",
    requiredNameError: "Ingresá el nombre de la submodalidad.",
    duplicateError:
      "Ya existe una submodalidad con ese nombre en esta modalidad.",
    duplicateFieldError: "Usá un nombre distinto para la submodalidad.",
  },
  "experience-level": {
    label: "nivel de experiencia",
    invalidError: "Revisá los datos del nivel de experiencia.",
    requiredNameError: "Ingresá el nombre del nivel de experiencia.",
    duplicateError:
      "Ya existe un nivel de experiencia con ese nombre en este evento.",
    duplicateFieldError: "Usá un nombre distinto para el nivel de experiencia.",
  },
  schedule: {
    label: "cronograma",
    invalidError: "Revisá los datos del cronograma.",
    requiredNameError: "Ingresá el nombre del cronograma.",
    duplicateError: "Ya existe un cronograma con ese nombre en este evento.",
    duplicateFieldError: "Usá un nombre distinto para el cronograma.",
  },
} satisfies Record<
  EventBaseEntityKind,
  {
    label: string;
    invalidError: string;
    requiredNameError: string;
    duplicateError: string;
    duplicateFieldError: string;
  }
>;

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

export async function createModality(
  eventId: string,
  input: EventBaseNameInput,
): Promise<EventBasesMutationResult> {
  const validation = await validateEventBaseName({
    eventId,
    name: input.name,
    kind: "modality",
  });

  if (!validation.ok) {
    return validation;
  }

  const [record] = await db
    .insert(modalities)
    .values({ eventId, name: toTitleCase(input.name) })
    .returning();

  return created(record);
}

export async function updateModality(
  modalityId: string,
  input: EventBaseNameInput,
): Promise<EventBasesMutationResult> {
  const modality = await db.query.modalities.findFirst({
    where: eq(modalities.id, modalityId),
  });

  if (!modality) {
    return eventBaseEntityNotFound("modality");
  }

  const validation = await validateEventBaseName({
    eventId: modality.eventId,
    name: input.name,
    kind: "modality",
    exceptId: modalityId,
  });

  if (!validation.ok) {
    return validation;
  }

  const [record] = await db
    .update(modalities)
    .set({ name: toTitleCase(input.name) })
    .where(eq(modalities.id, modalityId))
    .returning();

  return created(record);
}

export async function updateModalityWithSubmodalities(
  modalityId: string,
  input: ModalityWithSubmodalitiesInput,
): Promise<EventBasesMutationResult> {
  const modality = await db.query.modalities.findFirst({
    where: eq(modalities.id, modalityId),
  });

  if (!modality) {
    return eventBaseEntityNotFound("modality");
  }

  const validation = await validateEventBaseName({
    eventId: modality.eventId,
    name: input.name,
    kind: "modality",
    exceptId: modalityId,
  });

  if (!validation.ok) {
    return validation;
  }

  const existingEntries = await db.query.submodalities.findMany({
    where: eq(submodalities.modalityId, modalityId),
  });
  const submodalityValidation = validateInlineSubmodalitiesInput({
    existingEntries,
    submodalities: input.submodalities,
  });

  if (!submodalityValidation.ok) {
    return submodalityValidation;
  }

  return db.transaction(async (tx): Promise<EventBasesMutationResult> => {
    const [record] = await tx
      .update(modalities)
      .set({ name: toTitleCase(input.name) })
      .where(eq(modalities.id, modalityId))
      .returning();

    if (!record) {
      return eventBaseEntityNotFound("modality");
    }

    const nextEntries = submodalityValidation.entries;
    const nextIds = new Set(
      nextEntries
        .map((entry) => entry.id)
        .filter((id): id is string => Boolean(id)),
    );
    const entryIdsToDelete = existingEntries
      .map((entry) => entry.id)
      .filter((entryId) => !nextIds.has(entryId));

    if (entryIdsToDelete.length > 0) {
      await tx
        .delete(submodalities)
        .where(inArray(submodalities.id, entryIdsToDelete));
    }

    for (const entry of nextEntries) {
      if (entry.id) {
        await tx
          .update(submodalities)
          .set({ name: toTitleCase(entry.name) })
          .where(eq(submodalities.id, entry.id));
        continue;
      }

      await tx.insert(submodalities).values({
        eventId: modality.eventId,
        modalityId,
        name: toTitleCase(entry.name),
      });
    }

    return created(record);
  });
}

export async function deleteModality(
  modalityId: string,
): Promise<EventBasesDeleteResult> {
  const modality = await db.query.modalities.findFirst({
    where: eq(modalities.id, modalityId),
  });

  if (!modality) {
    return eventBaseEntityNotFound("modality");
  }

  const dependencyCheck = await modalityHasEventBaseDependencies(modalityId);

  if (!dependencyCheck.ok) {
    return dependencyCheck;
  }

  await db.delete(modalities).where(eq(modalities.id, modalityId));

  return { ok: true };
}

export async function createSubmodality(
  eventId: string,
  input: SubmodalityInput,
): Promise<EventBasesMutationResult> {
  const validation = await validateSubmodalityInput(eventId, input);

  if (!validation.ok) {
    return validation;
  }

  const [record] = await db
    .insert(submodalities)
    .values({
      eventId,
      modalityId: input.modalityId,
      name: toTitleCase(input.name),
    })
    .returning();

  return created(record);
}

export async function updateSubmodality(
  submodalityId: string,
  input: SubmodalityInput,
): Promise<EventBasesMutationResult> {
  const submodality = await db.query.submodalities.findFirst({
    where: eq(submodalities.id, submodalityId),
  });

  if (!submodality) {
    return eventBaseEntityNotFound("submodality");
  }

  const validation = await validateSubmodalityInput(
    submodality.eventId,
    {
      ...input,
      modalityId: submodality.modalityId,
    },
    submodalityId,
  );

  if (!validation.ok) {
    return validation;
  }

  const [record] = await db
    .update(submodalities)
    .set({
      name: toTitleCase(input.name),
    })
    .where(eq(submodalities.id, submodalityId))
    .returning();

  return created(record);
}

export async function deleteSubmodality(
  submodalityId: string,
): Promise<EventBasesDeleteResult> {
  const submodality = await db.query.submodalities.findFirst({
    where: eq(submodalities.id, submodalityId),
  });

  if (!submodality) {
    return eventBaseEntityNotFound("submodality");
  }

  await db.delete(submodalities).where(eq(submodalities.id, submodalityId));

  return { ok: true };
}

export async function createExperienceLevel(
  eventId: string,
  input: EventBaseNameInput,
): Promise<EventBasesMutationResult> {
  const validation = await validateEventBaseName({
    eventId,
    name: input.name,
    kind: "experience-level",
  });

  if (!validation.ok) {
    return validation;
  }

  const [record] = await db
    .insert(experienceLevels)
    .values({ eventId, name: input.name.trim() })
    .returning();

  return created(record);
}

export async function ensureExperienceLevelsForEvent(
  eventId: string,
  names: string[],
) {
  const uniqueNames = uniqueValues(names);

  if (uniqueNames.length === 0) {
    return [];
  }

  const existingLevels = await db.query.experienceLevels.findMany({
    where: and(
      eq(experienceLevels.eventId, eventId),
      inArray(
        sql`lower(${experienceLevels.name})`,
        uniqueNames.map((name) => normalizeEventBaseName(name)),
      ),
    ),
  });
  const idsByName = new Map(
    existingLevels.map((level) => [
      normalizeEventBaseName(level.name),
      level.id,
    ]),
  );
  const missingNames = uniqueNames.filter(
    (name) => !idsByName.has(normalizeEventBaseName(name)),
  );

  if (missingNames.length > 0) {
    const createdLevels = await db
      .insert(experienceLevels)
      .values(missingNames.map((name) => ({ eventId, name })))
      .returning();

    for (const level of createdLevels) {
      idsByName.set(normalizeEventBaseName(level.name), level.id);
    }
  }

  return uniqueNames
    .map((name) => idsByName.get(normalizeEventBaseName(name)))
    .filter((id): id is string => Boolean(id));
}

export async function updateExperienceLevel(
  experienceLevelId: string,
  input: EventBaseNameInput,
): Promise<EventBasesMutationResult> {
  const experienceLevel = await db.query.experienceLevels.findFirst({
    where: eq(experienceLevels.id, experienceLevelId),
  });

  if (!experienceLevel) {
    return eventBaseEntityNotFound("experience-level");
  }

  const validation = await validateEventBaseName({
    eventId: experienceLevel.eventId,
    name: input.name,
    kind: "experience-level",
    exceptId: experienceLevelId,
  });

  if (!validation.ok) {
    return validation;
  }

  const [record] = await db
    .update(experienceLevels)
    .set({ name: input.name.trim() })
    .where(eq(experienceLevels.id, experienceLevelId))
    .returning();

  return created(record);
}

export async function deleteExperienceLevel(
  experienceLevelId: string,
): Promise<EventBasesDeleteResult> {
  const experienceLevel = await db.query.experienceLevels.findFirst({
    where: eq(experienceLevels.id, experienceLevelId),
  });

  if (!experienceLevel) {
    return eventBaseEntityNotFound("experience-level");
  }

  if (await experienceLevelHasCategoryDependencies(experienceLevelId)) {
    return {
      ok: false,
      code: "event-bases-has-dependencies",
      error:
        "No se puede borrar el nivel de experiencia porque tiene categorías relacionadas.",
    };
  }

  await db
    .delete(experienceLevels)
    .where(eq(experienceLevels.id, experienceLevelId));

  return { ok: true };
}

export async function createCategory(
  eventId: string,
  input: CategoryInput,
): Promise<EventBasesMutationResult> {
  const validation = await validateCategoryInput(eventId, input);

  if (!validation.ok) {
    return validation;
  }

  const [record] = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(categories)
      .values({
        eventId,
        ...categoryValues(validation.input),
      })
      .returning();
    const category = inserted[0];

    if (!category) {
      return inserted;
    }

    await replaceCategoryRelations(tx, category.id, validation.input);

    return inserted;
  });

  return created(record);
}

export async function updateCategory(
  categoryId: string,
  input: CategoryInput,
): Promise<EventBasesMutationResult> {
  const category = await db.query.categories.findFirst({
    where: eq(categories.id, categoryId),
  });

  if (!category) {
    return categoryNotFound();
  }

  const validation = await validateCategoryInput(
    category.eventId,
    input,
    categoryId,
  );

  if (!validation.ok) {
    return validation;
  }

  const [record] = await db.transaction(async (tx) => {
    const updated = await tx
      .update(categories)
      .set(categoryValues(validation.input))
      .where(eq(categories.id, categoryId))
      .returning();

    await replaceCategoryRelations(tx, categoryId, validation.input);

    return updated;
  });

  return created(record);
}

export async function deleteCategory(
  categoryId: string,
): Promise<EventBasesDeleteResult> {
  const category = await db.query.categories.findFirst({
    where: eq(categories.id, categoryId),
  });

  if (!category) {
    return categoryNotFound();
  }

  await db.delete(categories).where(eq(categories.id, categoryId));

  return { ok: true };
}

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
  const [acceptedModalities, eventScheduleCapacities] = await Promise.all([
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
    db.query.scheduleCapacities.findMany({
      where: inArray(scheduleCapacities.scheduleId, scheduleIds),
      orderBy: [
        asc(scheduleCapacities.groupType),
        asc(scheduleCapacities.capacity),
      ],
    }),
  ]);

  const modalitiesByScheduleId = groupScheduleModalities(acceptedModalities);
  const capacitiesByScheduleId = groupScheduleCapacities(
    eventScheduleCapacities,
  );

  return eventSchedules.map((schedule) => {
    const scheduleModalities = modalitiesByScheduleId.get(schedule.id) ?? [];
    const capacitiesForSchedule = capacitiesByScheduleId.get(schedule.id) ?? [];

    return {
      ...schedule,
      modalities: scheduleModalities,
      modalityIds: scheduleModalities.map((modality) => modality.id),
      occupiedCapacity: capacitiesForSchedule.reduce(
        (total, capacity) => total + capacity.capacity,
        0,
      ),
      scheduleCapacities: capacitiesForSchedule,
    };
  });
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

  const validation = await validateScheduleInput(existing.eventId, input, {
    exceptId: scheduleId,
  });

  if (!validation.ok) {
    return validation;
  }

  const hasDependencies =
    dependencies.hasDependencies ?? scheduleHasOperationalDependencies;

  if (
    (await hasDependencies(scheduleId)) &&
    hasStructuralScheduleChanges(existing, input)
  ) {
    return {
      ok: false,
      code: "schedule-has-dependencies",
      error:
        "No se pueden editar fecha, hora, cupo total ni modalidades aceptadas porque el cronograma tiene dependencias.",
    };
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

  const validation = await validateScheduleInput(existing.eventId, input, {
    exceptId: scheduleId,
  });

  if (!validation.ok) {
    return validation;
  }

  const hasDependencies =
    dependencies.hasDependencies ?? scheduleHasOperationalDependencies;

  if (
    (await hasDependencies(scheduleId)) &&
    hasStructuralScheduleChanges(existing, input)
  ) {
    return {
      ok: false,
      code: "schedule-has-dependencies",
      error:
        "No se pueden editar fecha, hora, cupo total ni modalidades aceptadas porque el cronograma tiene dependencias.",
    };
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

  const hasDependencies =
    dependencies.hasDependencies ?? scheduleHasOperationalDependencies;

  if (await hasDependencies(scheduleId)) {
    return {
      ok: false,
      code: "schedule-has-dependencies",
      error: "No se puede borrar el cronograma porque tiene dependencias.",
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

export async function scheduleHasOperationalDependencies(scheduleId: string) {
  const price = await db.query.prices.findFirst({
    columns: { id: true },
    where: eq(prices.scheduleId, scheduleId),
  });

  return Boolean(price);
}

export async function listPrices(eventId: string): Promise<PriceListItem[]> {
  const eventPrices = await db.query.prices.findMany({
    where: eq(prices.eventId, eventId),
  });

  if (eventPrices.length === 0) {
    return [];
  }

  const scheduleIds = uniqueValues(
    eventPrices
      .map((price) => price.scheduleId)
      .filter((id): id is string => Boolean(id)),
  );
  const eventSchedules =
    scheduleIds.length > 0
      ? await db.query.schedules.findMany({
          where: inArray(schedules.id, scheduleIds),
          orderBy: [
            asc(schedules.scheduledDate),
            asc(schedules.startTime),
            asc(schedules.name),
          ],
        })
      : [];
  const schedulesById = new Map(
    eventSchedules.map((schedule) => [schedule.id, schedule]),
  );

  return eventPrices
    .map((price) => ({
      ...price,
      schedule: price.scheduleId
        ? (schedulesById.get(price.scheduleId) ?? null)
        : null,
    }))
    .sort(comparePrices);
}

export async function createPrice(
  eventId: string,
  input: PriceInput,
): Promise<EventBasesMutationResult> {
  const validation = await validatePriceInput(eventId, input);

  if (!validation.ok) {
    return validation;
  }

  const [record] = await db
    .insert(prices)
    .values({ eventId, ...validation.input })
    .returning();

  return created(record);
}

export async function updatePrice(
  priceId: string,
  input: PriceInput,
  dependencies: PriceDependencies = {},
): Promise<EventBasesMutationResult> {
  const existing = await db.query.prices.findFirst({
    where: eq(prices.id, priceId),
  });

  if (!existing) {
    return priceNotFound();
  }

  const validation = await validatePriceInput(existing.eventId, input, {
    exceptId: priceId,
  });

  if (!validation.ok) {
    return validation;
  }

  const hasDependencies =
    dependencies.hasDependencies ?? priceHasOperationalDependencies;

  if (
    (await hasDependencies(priceId)) &&
    hasStructuralPriceChanges(existing, validation.input)
  ) {
    return {
      ok: false,
      code: "event-bases-has-dependencies",
      error:
        "No se pueden editar monto, tipo de grupo ni cronograma porque el precio tiene dependencias.",
    };
  }

  const [record] = await db
    .update(prices)
    .set(validation.input)
    .where(eq(prices.id, priceId))
    .returning();

  return created(record);
}

export async function deletePrice(
  priceId: string,
  dependencies: PriceDependencies = {},
): Promise<EventBasesDeleteResult> {
  const price = await db.query.prices.findFirst({
    where: eq(prices.id, priceId),
  });

  if (!price) {
    return priceNotFound();
  }

  const hasDependencies =
    dependencies.hasDependencies ?? priceHasOperationalDependencies;

  if (await hasDependencies(priceId)) {
    return {
      ok: false,
      code: "event-bases-has-dependencies",
      error: "No se puede borrar el precio porque tiene dependencias.",
    };
  }

  await db.delete(prices).where(eq(prices.id, priceId));

  return { ok: true };
}

export async function resolveApplicablePrice(input: {
  eventId: string;
  groupType: string;
  paymentDate?: Date | string | null;
  scheduleId: string | null;
}): Promise<PriceResolutionResult> {
  if (!isGroupType(input.groupType)) {
    return {
      ok: false,
      code: "invalid-group-type",
      error: "No se pudo resolver el precio para ese tipo de grupo.",
    };
  }

  if (input.scheduleId) {
    const specificPrices = await db.query.prices.findMany({
      where: and(
        eq(prices.eventId, input.eventId),
        eq(prices.groupType, input.groupType),
        eq(prices.scheduleId, input.scheduleId),
      ),
    });
    const specificPrice = selectApplicablePrice(
      specificPrices,
      input.paymentDate,
    );

    if (specificPrice) {
      return { ok: true, price: specificPrice };
    }
  }

  const generalPrices = await db.query.prices.findMany({
    where: and(
      eq(prices.eventId, input.eventId),
      eq(prices.groupType, input.groupType),
      isNull(prices.scheduleId),
    ),
  });
  const generalPrice = selectApplicablePrice(generalPrices, input.paymentDate);

  if (generalPrice) {
    return { ok: true, price: generalPrice };
  }

  return {
    ok: false,
    code: "missing-price",
    error: "No hay un precio configurado para este tipo de grupo y cronograma.",
  };
}

export async function priceHasOperationalDependencies(_priceId: string) {
  return false;
}

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

export async function scheduleCapacityHasOperationalDependencies(
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

async function validateSubmodalityInput(
  eventId: string,
  input: SubmodalityInput,
  exceptId?: string,
): Promise<{ ok: true } | EventBaseFailure> {
  const modality = await db.query.modalities.findFirst({
    where: and(
      eq(modalities.id, input.modalityId),
      eq(modalities.eventId, eventId),
    ),
  });

  if (!modality) {
    return {
      ok: false,
      code: "invalid-modality",
      error: "Elegí una modalidad del evento activo.",
      fieldErrors: {
        modalityId: "Elegí una modalidad del evento activo.",
      },
    };
  }

  const nameValidation = await validateSubmodalityName({
    modalityId: modality.id,
    name: input.name,
    exceptId,
  });

  if (!nameValidation.ok) {
    return nameValidation;
  }

  return { ok: true };
}

async function validateSubmodalityName(input: {
  modalityId: string;
  name: string;
  exceptId?: string;
}): Promise<{ ok: true } | EventBaseFailure> {
  if (input.name.trim().length === 0) {
    return {
      ok: false,
      code: "invalid-event-bases",
      error: eventBaseCopy.submodality.invalidError,
      fieldErrors: { name: eventBaseCopy.submodality.requiredNameError },
    };
  }

  const duplicate = await findDuplicateSubmodalityName(input);

  if (duplicate) {
    return {
      ok: false,
      code: "duplicate-name",
      error: eventBaseCopy.submodality.duplicateError,
      fieldErrors: { name: eventBaseCopy.submodality.duplicateFieldError },
    };
  }

  return { ok: true };
}

async function validateEventBaseName(input: {
  eventId: string;
  name: string;
  kind: EventBaseEntityKind;
  exceptId?: string;
}): Promise<{ ok: true } | EventBaseFailure> {
  if (input.name.trim().length === 0) {
    return {
      ok: false,
      code: "invalid-event-bases",
      error: eventBaseCopy[input.kind].invalidError,
      fieldErrors: { name: eventBaseCopy[input.kind].requiredNameError },
    };
  }

  const duplicate = await findDuplicateName(input);

  if (duplicate) {
    return {
      ok: false,
      code: "duplicate-name",
      error: eventBaseCopy[input.kind].duplicateError,
      fieldErrors: { name: eventBaseCopy[input.kind].duplicateFieldError },
    };
  }

  return { ok: true };
}

async function validateScheduleInput(
  eventId: string,
  input: ScheduleInput,
  options: { exceptId?: string } = {},
): Promise<{ ok: true; input: ValidScheduleInput } | EventBaseFailure> {
  const fieldErrors: Record<string, string> = {};
  const copy = eventBaseCopy["schedule"];
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

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      code: "invalid-event-bases",
      error: copy.invalidError,
      fieldErrors,
    };
  }

  const duplicate = await findDuplicateName({
    eventId,
    name,
    kind: "schedule",
    exceptId: options.exceptId,
  });

  if (duplicate) {
    return {
      ok: false,
      code: "duplicate-name",
      error: copy.duplicateError,
      fieldErrors: { name: copy.duplicateFieldError },
    };
  }

  return { ok: true, input: { ...input, name } };
}

async function validatePriceInput(
  eventId: string,
  input: PriceInput,
  options: { exceptId?: string } = {},
): Promise<{ ok: true; input: ValidPriceInput } | EventBaseFailure> {
  const fieldErrors: Record<string, string> = {};
  const paymentDeadline = input.paymentDeadline.trim();
  const scheduleId = input.scheduleId?.trim() || null;

  if (input.groupType.trim().length === 0) {
    fieldErrors.groupType = requiredFieldMessage;
  } else if (!isGroupType(input.groupType)) {
    fieldErrors.groupType = "Elegí un tipo de grupo.";
  }

  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    fieldErrors.amount = "Ingresá un monto mayor a cero.";
  }

  if (!isDateOnly(paymentDeadline)) {
    fieldErrors.paymentDeadline = requiredFieldMessage;
  }

  if (scheduleId) {
    const schedule = await db.query.schedules.findFirst({
      columns: { id: true },
      where: and(eq(schedules.id, scheduleId), eq(schedules.eventId, eventId)),
    });

    if (!schedule) {
      fieldErrors.scheduleId = "Elegí un cronograma del evento activo.";
    }
  }

  const fieldErrorKeys = Object.keys(fieldErrors);

  if (fieldErrorKeys.length > 0 || !isGroupType(input.groupType)) {
    const onlyScheduleError =
      fieldErrorKeys.length === 1 && fieldErrorKeys[0] === "scheduleId";

    return {
      ok: false,
      code: "invalid-event-bases",
      error: onlyScheduleError
        ? "Elegí un cronograma del evento activo."
        : "Revisá los datos del precio.",
      fieldErrors,
    };
  }

  const validInput = {
    groupType: input.groupType,
    amount: input.amount,
    paymentDeadline,
    scheduleId,
  };

  if (await findDuplicatePrice(eventId, validInput, options.exceptId)) {
    return {
      ok: false,
      code: "duplicate-name",
      error: scheduleId
        ? "Ya existe un precio para ese tipo de grupo y cronograma."
        : "Ya existe un precio general para ese tipo de grupo.",
      fieldErrors: {
        groupType: "Revisá el tipo de grupo del precio.",
      },
    };
  }

  return { ok: true, input: validInput };
}

async function findDuplicatePrice(
  eventId: string,
  input: ValidPriceInput,
  exceptId?: string,
) {
  const idFilter = exceptId ? ne(prices.id, exceptId) : undefined;
  const scheduleFilter = input.scheduleId
    ? eq(prices.scheduleId, input.scheduleId)
    : isNull(prices.scheduleId);

  return db
    .select({ id: prices.id })
    .from(prices)
    .where(
      and(
        eq(prices.eventId, eventId),
        eq(prices.groupType, input.groupType),
        eq(prices.paymentDeadline, input.paymentDeadline),
        scheduleFilter,
        idFilter,
      ),
    )
    .limit(1)
    .then(([record]) => record);
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

async function validateInlineScheduleCapacitiesInput({
  existingEntries = [],
  scheduleCapacities: inputEntries,
  totalCapacity,
}: {
  existingEntries?: Array<typeof scheduleCapacities.$inferSelect>;
  scheduleCapacities: InlineScheduleCapacityInput[];
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

async function validateInlineScheduleCapacityDependencies({
  existingEntries,
  nextEntries,
}: {
  existingEntries: Array<typeof scheduleCapacities.$inferSelect>;
  nextEntries: ValidInlineScheduleCapacityInput[];
}): Promise<{ ok: true } | EventBaseFailure> {
  const nextEntryById = new Map(
    nextEntries
      .filter((entry) => entry.id)
      .map((entry) => [entry.id as string, entry]),
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

function validateInlineSubmodalitiesInput({
  existingEntries,
  submodalities: inputEntries,
}: {
  existingEntries: Array<typeof submodalities.$inferSelect>;
  submodalities: InlineSubmodalityInput[];
}): { ok: true; entries: ValidInlineSubmodalityInput[] } | EventBaseFailure {
  const fieldErrors: Record<string, string> = {};
  const existingEntryIds = new Set(existingEntries.map((entry) => entry.id));
  const firstIndexByName = new Map<string, number>();
  const entries = inputEntries.map((entry, index) => {
    const normalizedName = normalizeEventBaseName(entry.name);

    if (entry.id && !existingEntryIds.has(entry.id)) {
      fieldErrors[`submodalities.${index}.name`] =
        "No encontramos esa submodalidad en la modalidad.";
    }

    if (entry.name.trim().length === 0) {
      fieldErrors[`submodalities.${index}.name`] = requiredFieldMessage;
    }

    if (normalizedName) {
      const firstIndex = firstIndexByName.get(normalizedName);

      if (firstIndex === undefined) {
        firstIndexByName.set(normalizedName, index);
      } else {
        fieldErrors[`submodalities.${firstIndex}.name`] =
          eventBaseCopy.submodality.duplicateFieldError;
        fieldErrors[`submodalities.${index}.name`] =
          eventBaseCopy.submodality.duplicateFieldError;
      }
    }

    return {
      id: entry.id,
      index,
      name: entry.name,
    };
  });

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      code: "invalid-event-bases",
      error: eventBaseCopy.submodality.invalidError,
      fieldErrors,
    };
  }

  return { ok: true, entries };
}

async function validateCategoryInput(
  eventId: string,
  input: CategoryInput,
  exceptId?: string,
): Promise<{ ok: true; input: ValidCategoryInput } | EventBaseFailure> {
  const name = toTitleCase(input.name);

  if (name.length === 0) {
    return {
      ok: false,
      code: "invalid-event-bases",
      error: "Revisá los datos de la categoría.",
      fieldErrors: { name: "Ingresá el nombre de la categoría." },
    };
  }

  if (!Number.isInteger(input.minAge) || !Number.isInteger(input.maxAge)) {
    return {
      ok: false,
      code: "invalid-event-bases",
      error: "Revisá las edades de la categoría.",
      fieldErrors: { ageRange: "Ingresá edades válidas." },
    };
  }

  if (input.minAge < 0 || input.maxAge < input.minAge) {
    return {
      ok: false,
      code: "invalid-event-bases",
      error: "Revisá las edades de la categoría.",
      fieldErrors: {
        ageRange: "La edad máxima debe ser mayor o igual a la mínima.",
      },
    };
  }

  const groupTypes = uniqueValues(input.groupTypes)
    .filter(isGroupType)
    .sort((a, b) => groupTypeOrder.indexOf(a) - groupTypeOrder.indexOf(b));

  if (groupTypes.length === 0) {
    return {
      ok: false,
      code: "invalid-group-type",
      error: "Elegí al menos un tipo de grupo.",
      fieldErrors: { groupTypes: "Elegí al menos un tipo de grupo." },
    };
  }

  const modalityIds = uniqueValues(input.modalityIds);

  if (modalityIds.length === 0) {
    return {
      ok: false,
      code: "invalid-modality",
      error: "Elegí al menos una modalidad.",
      fieldErrors: { modalityIds: "Elegí al menos una modalidad." },
    };
  }

  const validModalities = await db
    .select({ id: modalities.id })
    .from(modalities)
    .where(
      and(eq(modalities.eventId, eventId), inArray(modalities.id, modalityIds)),
    );

  if (validModalities.length !== modalityIds.length) {
    return {
      ok: false,
      code: "invalid-modality",
      error: "Elegí modalidades del evento activo.",
      fieldErrors: {
        modalityIds: "Elegí modalidades del evento activo.",
      },
    };
  }

  const experienceLevelIds = uniqueValues(input.experienceLevelIds).sort();

  if (experienceLevelIds.length > 0) {
    const validExperienceLevels = await db
      .select({ id: experienceLevels.id })
      .from(experienceLevels)
      .where(
        and(
          eq(experienceLevels.eventId, eventId),
          inArray(experienceLevels.id, experienceLevelIds),
        ),
      );

    if (validExperienceLevels.length !== experienceLevelIds.length) {
      return {
        ok: false,
        code: "invalid-experience-level",
        error: "Elegí niveles de experiencia del evento activo.",
        fieldErrors: {
          experienceLevelIds: "Elegí niveles de experiencia del evento activo.",
        },
      };
    }
  }

  const validInput = {
    name,
    minAge: input.minAge,
    maxAge: input.maxAge,
    groupTypes,
    modalityIds: modalityIds.sort(),
    experienceLevelIds,
    groupTypeKey: groupTypes.join("|"),
    experienceLevelKey: experienceLevelIds.join("|"),
  };

  if (await findDuplicateCategory(eventId, validInput, exceptId)) {
    return {
      ok: false,
      code: "duplicate-category",
      error:
        "Ya existe una categoría con ese rango de edad, tipos de grupo y modalidades.",
      fieldErrors: {},
    };
  }

  if (await findOverlappingCategory(eventId, validInput, exceptId)) {
    return {
      ok: false,
      code: "invalid-event-bases",
      error:
        "La categoría se solapa con otra categoría para la misma modalidad y tipo de grupo.",
      fieldErrors: {},
    };
  }

  return { ok: true, input: validInput };
}

async function findDuplicateCategory(
  eventId: string,
  input: ValidCategoryInput,
  exceptId?: string,
) {
  const idFilter = exceptId ? ne(categories.id, exceptId) : undefined;
  const candidates = await db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        eq(categories.eventId, eventId),
        eq(categories.minAge, input.minAge),
        eq(categories.maxAge, input.maxAge),
        eq(categories.groupTypeKey, input.groupTypeKey),
        idFilter,
      ),
    );

  if (candidates.length === 0) {
    return false;
  }

  const relationRows = await db
    .select({
      categoryId: categoryModalities.categoryId,
      modalityId: categoryModalities.modalityId,
    })
    .from(categoryModalities)
    .where(
      inArray(
        categoryModalities.categoryId,
        candidates.map((category) => category.id),
      ),
    );

  return candidates.some((category) => {
    const modalityIds = relationRows
      .filter((relation) => relation.categoryId === category.id)
      .map((relation) => relation.modalityId)
      .sort();

    return haveSameValues(modalityIds, input.modalityIds);
  });
}

async function findOverlappingCategory(
  eventId: string,
  input: ValidCategoryInput,
  exceptId?: string,
) {
  const idFilter = exceptId ? ne(categories.id, exceptId) : undefined;
  const possibleOverlaps = await db
    .select({
      id: categories.id,
      groupTypes: categories.groupTypes,
    })
    .from(categories)
    .where(
      and(
        eq(categories.eventId, eventId),
        sql`${categories.minAge} <= ${input.maxAge}`,
        sql`${categories.maxAge} >= ${input.minAge}`,
        idFilter,
      ),
    );

  if (possibleOverlaps.length === 0) {
    return false;
  }

  const relationRows = await db
    .select({
      categoryId: categoryModalities.categoryId,
      modalityId: categoryModalities.modalityId,
    })
    .from(categoryModalities)
    .where(
      inArray(
        categoryModalities.categoryId,
        possibleOverlaps.map((category) => category.id),
      ),
    );

  return possibleOverlaps.some((category) => {
    const hasSharedGroupType = category.groupTypes.some((groupType) =>
      input.groupTypes.includes(groupType),
    );
    const hasSharedModality = relationRows.some(
      (relation) =>
        relation.categoryId === category.id &&
        input.modalityIds.includes(relation.modalityId),
    );

    return hasSharedGroupType && hasSharedModality;
  });
}

async function findDuplicateName(input: {
  eventId: string;
  name: string;
  kind: EventBaseEntityKind;
  exceptId?: string;
}) {
  const normalizedName = normalizeEventBaseName(input.name);
  const table = getTable(input.kind);
  const idFilter = input.exceptId ? ne(table.id, input.exceptId) : undefined;
  const filters = [eq(table.eventId, input.eventId), idFilter].filter(Boolean);

  return db
    .select({ id: table.id, name: table.name })
    .from(table)
    .where(and(...filters))
    .then((records) =>
      records.find(
        (record) => normalizeEventBaseName(record.name) === normalizedName,
      ),
    );
}

async function findDuplicateSubmodalityName(input: {
  modalityId: string;
  name: string;
  exceptId?: string;
}) {
  const normalizedName = normalizeEventBaseName(input.name);
  const idFilter = input.exceptId
    ? ne(submodalities.id, input.exceptId)
    : undefined;
  const filters = [
    eq(submodalities.modalityId, input.modalityId),
    idFilter,
  ].filter(Boolean);

  return db
    .select({ id: submodalities.id, name: submodalities.name })
    .from(submodalities)
    .where(and(...filters))
    .then((records) =>
      records.find(
        (record) => normalizeEventBaseName(record.name) === normalizedName,
      ),
    );
}

function normalizeEventBaseName(name: string) {
  return name
    .trim()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("es");
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

async function scheduleHasScheduleCapacities(scheduleId: string) {
  const scheduleCapacity = await db.query.scheduleCapacities.findFirst({
    columns: { id: true },
    where: eq(scheduleCapacities.scheduleId, scheduleId),
  });

  return Boolean(scheduleCapacity);
}

async function modalityHasEventBaseDependencies(
  modalityId: string,
): Promise<EventBasesDeleteResult> {
  const submodality = await db.query.submodalities.findFirst({
    columns: { id: true },
    where: eq(submodalities.modalityId, modalityId),
  });

  if (submodality) {
    return {
      ok: false,
      code: "event-bases-has-dependencies",
      error:
        "No se puede borrar la modalidad porque tiene submodalidades relacionadas.",
    };
  }

  const categoryRelation = await db.query.categoryModalities.findFirst({
    columns: { categoryId: true },
    where: eq(categoryModalities.modalityId, modalityId),
  });

  if (categoryRelation) {
    return {
      ok: false,
      code: "event-bases-has-dependencies",
      error:
        "No se puede borrar la modalidad porque tiene categorías relacionadas.",
    };
  }

  const scheduleRelation = await db.query.scheduleModalities.findFirst({
    columns: { scheduleId: true },
    where: eq(scheduleModalities.modalityId, modalityId),
  });

  if (scheduleRelation) {
    return {
      ok: false,
      code: "event-bases-has-dependencies",
      error:
        "No se puede borrar la modalidad porque tiene Cronogramas relacionados.",
    };
  }

  return { ok: true };
}

async function experienceLevelHasCategoryDependencies(
  experienceLevelId: string,
) {
  const categoryRelation = await db.query.categoryExperienceLevels.findFirst({
    columns: { categoryId: true },
    where: eq(categoryExperienceLevels.experienceLevelId, experienceLevelId),
  });

  return Boolean(categoryRelation);
}

async function replaceCategoryRelations(
  tx: EventBasesTransaction,
  categoryId: string,
  input: ValidCategoryInput,
) {
  await tx
    .delete(categoryModalities)
    .where(eq(categoryModalities.categoryId, categoryId));
  await tx
    .delete(categoryExperienceLevels)
    .where(eq(categoryExperienceLevels.categoryId, categoryId));

  await tx.insert(categoryModalities).values(
    input.modalityIds.map((modalityId) => ({
      categoryId,
      modalityId,
    })),
  );

  if (input.experienceLevelIds.length > 0) {
    await tx.insert(categoryExperienceLevels).values(
      input.experienceLevelIds.map((experienceLevelId) => ({
        categoryId,
        experienceLevelId,
      })),
    );
  }
}

function created(
  record: EventBaseRecord | undefined,
): EventBasesMutationResult {
  if (!record) {
    return {
      ok: false,
      code: "invalid-event-bases",
      error: "No se pudo guardar el registro de configuración.",
    };
  }

  return { ok: true, record };
}

function eventBaseEntityNotFound(kind: EventBaseEntityKind): EventBaseFailure {
  return {
    ok: false,
    code: "event-bases-not-found",
    error: `No encontramos esa ${eventBaseCopy[kind].label}.`,
  };
}

function categoryNotFound(): EventBaseFailure {
  return {
    ok: false,
    code: "event-bases-not-found",
    error: "No encontramos esa categoría.",
  };
}

function priceNotFound(): EventBaseFailure {
  return {
    ok: false,
    code: "event-bases-not-found",
    error: "No encontramos ese precio.",
  };
}

function scheduleCapacityNotFound(): EventBaseFailure {
  return {
    ok: false,
    code: "event-bases-not-found",
    error: "No encontramos ese cupo de cronograma.",
  };
}

function getTable(kind: EventBaseEntityKind) {
  switch (kind) {
    case "modality":
      return modalities;
    case "submodality":
      return submodalities;
    case "experience-level":
      return experienceLevels;
    case "schedule":
      return schedules;
  }
}

function uniqueValues(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function haveSameValues(first: string[], second: string[]) {
  if (first.length !== second.length) {
    return false;
  }

  return first.every((value, index) => value === second[index]);
}

function sortedIds(ids: string[]) {
  return uniqueValues(ids).sort((first, second) => first.localeCompare(second));
}

function isGroupType(value: string): value is GroupType {
  return ["solo", "duo", "trio", "grupal"].includes(value);
}

function categoryValues(input: ValidCategoryInput) {
  return {
    name: input.name,
    minAge: input.minAge,
    maxAge: input.maxAge,
    groupTypes: input.groupTypes,
    groupTypeKey: input.groupTypeKey,
    experienceLevelKey: input.experienceLevelKey,
  };
}

function groupRelationIdsByCategory<TRelation extends CategoryRelationRow>(
  relations: TRelation[],
  getId: (relation: TRelation) => string,
) {
  const idsByCategory = new Map<string, string[]>();

  for (const relation of relations) {
    const ids = idsByCategory.get(relation.categoryId) ?? [];

    ids.push(getId(relation));
    idsByCategory.set(relation.categoryId, ids);
  }

  return idsByCategory;
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

function hasStructuralScheduleChanges(
  existing: typeof schedules.$inferSelect & { modalityIds: string[] },
  input: ScheduleInput,
) {
  return (
    existing.scheduledDate !== input.scheduledDate ||
    existing.startTime !== normalizeTime(input.startTime) ||
    existing.totalCapacity !== input.totalCapacity ||
    sortedIds(existing.modalityIds).join("\0") !==
      sortedIds(input.modalityIds).join("\0")
  );
}

function hasStructuralPriceChanges(
  existing: typeof prices.$inferSelect,
  input: ValidPriceInput,
) {
  return (
    existing.groupType !== input.groupType ||
    existing.amount !== input.amount ||
    existing.paymentDeadline !== input.paymentDeadline ||
    existing.scheduleId !== input.scheduleId
  );
}

function comparePrices(first: PriceListItem, second: PriceListItem) {
  const groupTypeComparison =
    groupTypeOrder.indexOf(first.groupType) -
    groupTypeOrder.indexOf(second.groupType);

  if (groupTypeComparison !== 0) {
    return groupTypeComparison;
  }

  if (first.schedule && !second.schedule) {
    return -1;
  }

  if (!first.schedule && second.schedule) {
    return 1;
  }

  const firstScheduleKey = first.schedule
    ? `${first.schedule.scheduledDate}\0${first.schedule.startTime}\0${first.schedule.name}`
    : "";
  const secondScheduleKey = second.schedule
    ? `${second.schedule.scheduledDate}\0${second.schedule.startTime}\0${second.schedule.name}`
    : "";
  const scheduleComparison = firstScheduleKey.localeCompare(secondScheduleKey);

  if (scheduleComparison !== 0) {
    return scheduleComparison;
  }

  return first.amount - second.amount;
}

function selectApplicablePrice(
  candidates: Array<typeof prices.$inferSelect>,
  paymentDate: Date | string | null | undefined,
) {
  const dateOnly = paymentDate ? toDateOnly(paymentDate) : null;
  const applicableCandidates = dateOnly
    ? candidates.filter(
        (price) =>
          price.paymentDeadline === null || price.paymentDeadline >= dateOnly,
      )
    : candidates;

  return applicableCandidates.sort(compareApplicablePrices)[0] ?? null;
}

function compareApplicablePrices(
  first: typeof prices.$inferSelect,
  second: typeof prices.$inferSelect,
) {
  if (first.paymentDeadline === null && second.paymentDeadline !== null) {
    return 1;
  }

  if (first.paymentDeadline !== null && second.paymentDeadline === null) {
    return -1;
  }

  if (first.paymentDeadline && second.paymentDeadline) {
    const deadlineComparison = first.paymentDeadline.localeCompare(
      second.paymentDeadline,
    );

    if (deadlineComparison !== 0) {
      return deadlineComparison;
    }
  }

  return first.amount - second.amount;
}

function isDateOnly(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function toDateOnly(value: Date | string) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return value.slice(0, 10);
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
    const scheduleModalities =
      modalitiesByScheduleId.get(modality.scheduleId) ?? [];

    scheduleModalities.push({
      id: modality.modalityId,
      name: modality.modalityName,
    });
    modalitiesByScheduleId.set(modality.scheduleId, scheduleModalities);
  }

  return modalitiesByScheduleId;
}

function groupScheduleCapacities(capacities: ScheduleCapacityListItem[]) {
  const capacitiesByScheduleId = new Map<string, ScheduleCapacityListItem[]>();

  for (const capacity of capacities) {
    const scheduleCapacities =
      capacitiesByScheduleId.get(capacity.scheduleId) ?? [];

    scheduleCapacities.push(capacity);
    capacitiesByScheduleId.set(capacity.scheduleId, scheduleCapacities);
  }

  return capacitiesByScheduleId;
}

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);

  return (
    !Number.isNaN(date.getTime()) && value === date.toISOString().slice(0, 10)
  );
}

function isValidTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function normalizeTime(value: string) {
  return value.slice(0, 5);
}

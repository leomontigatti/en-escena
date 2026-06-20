import { and, eq, inArray, ne } from "drizzle-orm";

import {
  categoryExperienceLevels,
  categoryModalities,
  created,
  db,
  eventBaseCopy,
  eventBaseEntityNotFound,
  experienceLevels,
  findExperienceLevelsByNames,
  modalities,
  normalizeEventBaseName,
  requiredFieldMessage,
  scheduleModalities,
  submodalities,
  toTitleCase,
  uniqueValues,
  validateEventBaseName,
} from "@/lib/events/bases-repository/shared.server";
import type {
  EventBaseFailure,
  EventBasesDeleteResult,
  EventBasesMutationResult,
  EventBaseNameInput,
  InlineSubmodalityInput,
  ModalityWithSubmodalitiesInput,
  SubmodalityInput,
  ValidInlineSubmodalityInput,
} from "@/lib/events/bases-repository/shared.server";

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

  const existingLevels = await findExperienceLevelsByNames(
    eventId,
    uniqueNames,
  );
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

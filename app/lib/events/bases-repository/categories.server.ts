import { and, asc, eq, inArray, ne, or, sql, type SQL } from "drizzle-orm";

import {
  categories,
  categoryModalities,
  categoryNotFound,
  categoryValues,
  choreographies,
  created,
  db,
  experienceLevelOrder,
  groupRelationIdsByCategory,
  groupTypeOrder,
  hasOccupyingChoreographies,
  hasReferencingChoreographies,
  haveSameValues,
  isExperienceLevel,
  isGroupType,
  modalities,
  replaceCategoryRelations,
  toTitleCase,
  uniqueValues,
} from "@/lib/events/bases-repository/shared.server";
import type {
  CategoryInput,
  EventBaseFailure,
  EventBasesDeleteResult,
  EventBasesMutationResult,
  ValidCategoryInput,
} from "@/lib/events/bases-repository/shared.server";

export async function listCategories(eventId: string) {
  const [eventCategories, eventCategoryModalities] = await Promise.all([
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
  ]);

  const modalityIdsByCategory = groupRelationIdsByCategory(
    eventCategoryModalities,
    (relation) => relation.modalityId,
  );

  return eventCategories.map((category) => ({
    ...category,
    modalityIds: modalityIdsByCategory.get(category.id) ?? [],
    experienceLevels: category.experienceLevels,
  }));
}

export async function getCategory(eventId: string, categoryId: string) {
  const [category, eventCategoryModalities] = await Promise.all([
    db.query.categories.findFirst({
      where: and(
        eq(categories.eventId, eventId),
        eq(categories.id, categoryId),
      ),
    }),
    db
      .select({
        modalityId: categoryModalities.modalityId,
      })
      .from(categoryModalities)
      .innerJoin(categories, eq(categories.id, categoryModalities.categoryId))
      .where(
        and(eq(categories.eventId, eventId), eq(categories.id, categoryId)),
      ),
  ]);

  if (!category) {
    return null;
  }

  return {
    ...category,
    modalityIds: eventCategoryModalities.map((relation) => relation.modalityId),
    experienceLevels: category.experienceLevels,
  };
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

  if (await removesOccupiedRegistrationPaths(category, validation.input)) {
    return {
      ok: false,
      code: "event-bases-has-dependencies",
      error:
        "No se pueden quitar tipos de grupo, modalidades ni niveles de experiencia que las coreografías de la categoría todavía usan.",
    };
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

  // Broader than the update guard on purpose: `choreography.category_id` has no
  // `on delete` behaviour, so the foreign key refuses the delete under any
  // choreography, withdrawn inscriptions included. Reporting that as a typed
  // failure is what this check adds; the refusal itself is the database's.
  if (
    await hasReferencingChoreographies(
      eq(choreographies.categoryId, categoryId),
    )
  ) {
    return {
      ok: false,
      code: "event-bases-has-dependencies",
      error:
        "No se puede borrar la categoría porque tiene coreografías relacionadas.",
    };
  }

  await db.delete(categories).where(eq(categories.id, categoryId));

  return { ok: true };
}

/**
 * Whether the edit drops a registration path a choreography of the category
 * still sits on: a group type, a modality link or an experience level it no
 * longer offers. Readiness only walks the paths still reachable, so an orphaned
 * choreography stops having a price demanded for it while the finance screens
 * keep resolving one.
 *
 * Only removals count. A rename leaves every path standing, and so does an
 * age-range edit: a choreography stores its own age basis and calculation mode,
 * so an age edit re-categorises rather than orphans.
 */
async function removesOccupiedRegistrationPaths(
  category: typeof categories.$inferSelect,
  input: ValidCategoryInput,
) {
  const existingModalityIds = await db
    .select({ modalityId: categoryModalities.modalityId })
    .from(categoryModalities)
    .where(eq(categoryModalities.categoryId, category.id));
  const removedGroupTypes = category.groupTypes.filter(
    (groupType) => !input.groupTypes.includes(groupType),
  );
  const removedModalityIds = existingModalityIds
    .map((relation) => relation.modalityId)
    .filter((modalityId) => !input.modalityIds.includes(modalityId));
  const removedExperienceLevels = category.experienceLevels.filter(
    (experienceLevel) => !input.experienceLevels.includes(experienceLevel),
  );
  const removedPaths = [
    removedGroupTypes.length > 0
      ? inArray(choreographies.groupType, removedGroupTypes)
      : null,
    removedModalityIds.length > 0
      ? inArray(choreographies.modalityId, removedModalityIds)
      : null,
    removedExperienceLevels.length > 0
      ? inArray(choreographies.experienceLevelId, removedExperienceLevels)
      : null,
  ].filter((path): path is SQL => path !== null);

  if (removedPaths.length === 0) {
    return false;
  }

  return hasOccupyingChoreographies(
    and(eq(choreographies.categoryId, category.id), or(...removedPaths)),
  );
}

async function validateCategoryInput(
  eventId: string,
  input: CategoryInput,
  exceptId?: string,
): Promise<{ ok: true; input: ValidCategoryInput } | EventBaseFailure> {
  const normalizedName = toTitleCase(input.name);

  if (normalizedName.length === 0) {
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

  const experienceLevels = uniqueValues(input.experienceLevels)
    .filter(isExperienceLevel)
    .sort(
      (a, b) =>
        experienceLevelOrder.indexOf(a) - experienceLevelOrder.indexOf(b),
    );

  if (experienceLevels.length !== uniqueValues(input.experienceLevels).length) {
    return {
      ok: false,
      code: "invalid-experience-level",
      error: "Elegí niveles de experiencia válidos.",
      fieldErrors: {
        experienceLevels: "Elegí niveles de experiencia válidos.",
      },
    };
  }

  const validInput = {
    name: normalizedName,
    minAge: input.minAge,
    maxAge: input.maxAge,
    groupTypes,
    modalityIds: modalityIds.sort(),
    experienceLevels,
    groupTypeKey: groupTypes.join("|"),
    experienceLevelKey: experienceLevels.join("|"),
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
      input.groupTypes.some((inputGroupType) => inputGroupType === groupType),
    );
    const hasSharedModality = relationRows.some(
      (relation) =>
        relation.categoryId === category.id &&
        input.modalityIds.includes(relation.modalityId),
    );

    return hasSharedGroupType && hasSharedModality;
  });
}

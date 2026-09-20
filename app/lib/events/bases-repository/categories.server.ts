import { and, asc, eq, inArray, ne, or, sql, type SQL } from "drizzle-orm";

import { formatChoreographyReferences } from "@/lib/choreographies/choreography-messages";
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

  const ageOrLevelEditRefusal = await refuseAgeOrLevelEditUnderChoreographies(
    category,
    validation.input,
  );

  if (ageOrLevelEditRefusal) {
    return ageOrLevelEditRefusal;
  }

  if (await removesOccupiedRegistrationPaths(category, validation.input)) {
    return {
      ok: false,
      code: "event-bases-has-dependencies",
      error:
        "No se pueden quitar tipos de grupo ni modalidades que las coreografías de la categoría todavía usan.",
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
 * The age range and the experience level set decide what a category means for
 * the choreographies already on it, so neither can move while any choreography
 * references it.
 *
 * Moving the range opens a gap under those choreographies: a choreography
 * stores its own age basis, so the next recalculation lands it on no category
 * at all, and every write that would do that is refused. Editing the level set
 * turns a stored level into a violation at once — adding levels leaves the
 * choreography without one, removing the level it holds leaves it invalid.
 *
 * The breadth is the deletion guard's, withdrawn inscriptions included: a
 * withdrawn inscription still preserves the category the choreography competed
 * in. Renaming, and any edit to a category no choreography references, stay
 * allowed.
 */
async function refuseAgeOrLevelEditUnderChoreographies(
  category: typeof categories.$inferSelect,
  input: ValidCategoryInput,
): Promise<EventBaseFailure | null> {
  const changesAgeRange =
    category.minAge !== input.minAge || category.maxAge !== input.maxAge;
  // Both sides are sorted by `experienceLevelOrder` — the stored set because
  // `validateCategoryInput` sorted it on the way in, the input because it is
  // sorting it right now — so an order-sensitive comparison is an equality of
  // sets here. A write that stored the set unsorted would break that.
  const changesExperienceLevels = !haveSameValues(
    category.experienceLevels,
    input.experienceLevels,
  );

  if (!changesAgeRange && !changesExperienceLevels) {
    return null;
  }

  const referencingChoreographies = await listReferencingChoreographies(
    category.id,
  );

  if (referencingChoreographies.length === 0) {
    return null;
  }

  // Telling the administrator the edit is impossible without saying what stands
  // in the way leaves them nothing to act on, so the refusal names the
  // choreographies the way the birth-date correction names its own.
  const relatedChoreographies =
    referencingChoreographies.length === 1
      ? "una coreografía relacionada"
      : "coreografías relacionadas";
  const list = formatChoreographyReferences(referencingChoreographies);
  const subject = `una categoría que tiene ${relatedChoreographies}: ${list}`;

  return {
    ok: false,
    code: "event-bases-has-dependencies",
    error: changesAgeRange
      ? `No se puede cambiar el rango de edad de ${subject}.`
      : `No se pueden cambiar los niveles de experiencia de ${subject}.`,
  };
}

/**
 * The choreographies the edit guard refuses over: the deletion guard's breadth,
 * withdrawn inscriptions included, but reported by number and name rather than
 * as a yes or no. Ordering is left to `formatChoreographyReferences`, which
 * sorts by number as part of wording the refusal.
 */
async function listReferencingChoreographies(categoryId: string) {
  return db
    .select({
      choreographyNumber: choreographies.choreographyNumber,
      name: choreographies.name,
    })
    .from(choreographies)
    .where(eq(choreographies.categoryId, categoryId));
}

/**
 * Whether the edit drops a registration path a choreography of the category
 * still sits on: a group type or a modality link it no longer offers.
 * Readiness only walks the paths still reachable, so an orphaned choreography
 * stops having a price demanded for it while the finance screens keep resolving
 * one.
 *
 * Only removals count, and a rename leaves every path standing. Experience
 * levels are not asked about here: the guard above already refuses every edit
 * to the set under a referencing choreography, which is the broader population.
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
  const removedPaths = [
    removedGroupTypes.length > 0
      ? inArray(choreographies.groupType, removedGroupTypes)
      : null,
    removedModalityIds.length > 0
      ? inArray(choreographies.modalityId, removedModalityIds)
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

import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  categories,
  categoryExperienceLevels,
  categoryModalities,
  experienceLevels,
  modalities,
  prices,
  scheduleEntries,
  scheduleBlockModalities,
  scheduleBlocks,
  submodalities,
} from "@/db/schema";

type CatalogKind =
  | "modality"
  | "submodality"
  | "experience-level"
  | "schedule-block";
type GroupType = "solo" | "duo" | "trio" | "grupal";
const groupTypeOrder: GroupType[] = ["solo", "duo", "trio", "grupal"];

type CatalogRecord =
  | typeof modalities.$inferSelect
  | typeof scheduleEntries.$inferSelect
  | typeof scheduleBlocks.$inferSelect
  | typeof submodalities.$inferSelect
  | typeof experienceLevels.$inferSelect
  | typeof categories.$inferSelect
  | typeof prices.$inferSelect;

type CatalogSuccess = {
  ok: true;
  record: CatalogRecord;
};

type CatalogFailure = {
  ok: false;
  code:
    | "catalog-has-dependencies"
    | "catalog-not-found"
    | "duplicate-name"
    | "duplicate-category"
    | "invalid-catalog"
    | "invalid-experience-level"
    | "invalid-group-type"
    | "invalid-modality"
    | "missing-price"
    | "invalid-schedule-entry"
    | "schedule-block-has-dependencies";
  error: string;
  fieldErrors?: Record<string, string>;
};

export type CatalogMutationResult = CatalogSuccess | CatalogFailure;
export type CatalogDeleteResult = { ok: true } | CatalogFailure;

type CatalogNameInput = {
  name: string;
};

type SubmodalityInput = CatalogNameInput & {
  modalityId: string;
};

type CategoryInput = CatalogNameInput & {
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

type CategoryRelationRow = {
  categoryId: string;
};

type CompatibleScheduleEntryRow = typeof scheduleEntries.$inferSelect & {
  blockId: string;
  blockName: string;
  blockDate: string;
  blockTime: string;
};

type CatalogTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type ScheduleBlockInput = CatalogNameInput & {
  scheduledDate: string;
  startTime: string;
  totalCapacity: number;
  modalityIds: string[];
};

export type ScheduleEntryInput = {
  groupTypes: string[];
  capacity: number;
};

type ScheduleBlockDependencies = {
  hasDependencies?: (scheduleBlockId: string) => Promise<boolean> | boolean;
};

type ScheduleEntryDependencies = {
  hasDependencies?: (scheduleEntryId: string) => Promise<boolean> | boolean;
};

export type ScheduleBlockListItem = typeof scheduleBlocks.$inferSelect & {
  modalities: Array<Pick<typeof modalities.$inferSelect, "id" | "name">>;
  modalityIds: string[];
  scheduleEntries: ScheduleEntryListItem[];
};

export type ScheduleEntryListItem = typeof scheduleEntries.$inferSelect;

export type CompatibleScheduleEntryResolution =
  | {
      status: "none";
      error: string;
      options: [];
    }
  | {
      status: "auto";
      scheduleEntry: CompatibleScheduleEntry;
      options: [CompatibleScheduleEntry];
    }
  | {
      status: "multiple";
      options: CompatibleScheduleEntry[];
    };

export type CompatibleScheduleEntry = typeof scheduleEntries.$inferSelect & {
  scheduleBlock: Pick<
    typeof scheduleBlocks.$inferSelect,
    "id" | "name" | "scheduledDate" | "startTime"
  >;
};

export type PriceInput = CatalogNameInput & {
  groupType: string;
  amount: number;
  scheduleBlockId: string | null;
};

type ValidPriceInput = {
  name: string;
  groupType: GroupType;
  amount: number;
  scheduleBlockId: string | null;
};

type PriceDependencies = {
  hasDependencies?: (priceId: string) => Promise<boolean> | boolean;
};

export type PriceListItem = typeof prices.$inferSelect & {
  scheduleBlock: Pick<
    typeof scheduleBlocks.$inferSelect,
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

const catalogCopy = {
  modality: {
    label: "Modalidad",
    invalidError: "Revisá los datos de la Modalidad.",
    requiredNameError: "Ingresá el nombre de la Modalidad.",
    duplicateError: "Ya existe una Modalidad con ese nombre en este Evento.",
    duplicateFieldError: "Usá un nombre distinto para la Modalidad.",
  },
  submodality: {
    label: "Submodalidad",
    invalidError: "Revisá los datos de la Submodalidad.",
    requiredNameError: "Ingresá el nombre de la Submodalidad.",
    duplicateError: "Ya existe una Submodalidad con ese nombre en este Evento.",
    duplicateFieldError: "Usá un nombre distinto para la Submodalidad.",
  },
  "experience-level": {
    label: "Nivel de experiencia",
    invalidError: "Revisá los datos del Nivel de experiencia.",
    requiredNameError: "Ingresá el nombre del Nivel de experiencia.",
    duplicateError:
      "Ya existe un Nivel de experiencia con ese nombre en este Evento.",
    duplicateFieldError: "Usá un nombre distinto para el Nivel de experiencia.",
  },
  "schedule-block": {
    label: "Bloque horario",
    invalidError: "Revisá los datos del Bloque horario.",
    requiredNameError: "Ingresá el nombre del Bloque horario.",
    duplicateError:
      "Ya existe un Bloque horario con ese nombre en este Evento.",
    duplicateFieldError: "Usá un nombre distinto para el Bloque horario.",
  },
} satisfies Record<
  CatalogKind,
  {
    label: string;
    invalidError: string;
    requiredNameError: string;
    duplicateError: string;
    duplicateFieldError: string;
  }
>;

export async function listEventCatalogs(eventId: string) {
  const [
    eventModalities,
    eventSubmodalities,
    eventExperienceLevels,
    eventCategories,
    eventCategoryModalities,
    eventCategoryExperienceLevels,
    eventScheduleBlocks,
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
    listScheduleBlocks(eventId),
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
    scheduleBlocks: eventScheduleBlocks,
    prices: eventPrices,
  };
}

export async function createModality(
  eventId: string,
  input: CatalogNameInput,
): Promise<CatalogMutationResult> {
  const validation = await validateCatalogName({
    eventId,
    name: input.name,
    kind: "modality",
  });

  if (!validation.ok) {
    return validation;
  }

  const [record] = await db
    .insert(modalities)
    .values({ eventId, name: input.name.trim() })
    .returning();

  return created(record);
}

export async function updateModality(
  modalityId: string,
  input: CatalogNameInput,
): Promise<CatalogMutationResult> {
  const modality = await db.query.modalities.findFirst({
    where: eq(modalities.id, modalityId),
  });

  if (!modality) {
    return catalogNotFound("modality");
  }

  const validation = await validateCatalogName({
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
    .set({ name: input.name.trim() })
    .where(eq(modalities.id, modalityId))
    .returning();

  return created(record);
}

export async function deleteModality(
  modalityId: string,
): Promise<CatalogDeleteResult> {
  const modality = await db.query.modalities.findFirst({
    where: eq(modalities.id, modalityId),
  });

  if (!modality) {
    return catalogNotFound("modality");
  }

  const dependencyCheck =
    await modalityHasConfigurationDependencies(modalityId);

  if (!dependencyCheck.ok) {
    return dependencyCheck;
  }

  await db.delete(modalities).where(eq(modalities.id, modalityId));

  return { ok: true };
}

export async function createSubmodality(
  eventId: string,
  input: SubmodalityInput,
): Promise<CatalogMutationResult> {
  const validation = await validateSubmodalityInput(eventId, input);

  if (!validation.ok) {
    return validation;
  }

  const [record] = await db
    .insert(submodalities)
    .values({
      eventId,
      modalityId: input.modalityId,
      name: input.name.trim(),
    })
    .returning();

  return created(record);
}

export async function updateSubmodality(
  submodalityId: string,
  input: SubmodalityInput,
): Promise<CatalogMutationResult> {
  const submodality = await db.query.submodalities.findFirst({
    where: eq(submodalities.id, submodalityId),
  });

  if (!submodality) {
    return catalogNotFound("submodality");
  }

  const validation = await validateSubmodalityInput(
    submodality.eventId,
    input,
    submodalityId,
  );

  if (!validation.ok) {
    return validation;
  }

  const [record] = await db
    .update(submodalities)
    .set({
      modalityId: input.modalityId,
      name: input.name.trim(),
    })
    .where(eq(submodalities.id, submodalityId))
    .returning();

  return created(record);
}

export async function deleteSubmodality(
  submodalityId: string,
): Promise<CatalogDeleteResult> {
  const submodality = await db.query.submodalities.findFirst({
    where: eq(submodalities.id, submodalityId),
  });

  if (!submodality) {
    return catalogNotFound("submodality");
  }

  await db.delete(submodalities).where(eq(submodalities.id, submodalityId));

  return { ok: true };
}

export async function createExperienceLevel(
  eventId: string,
  input: CatalogNameInput,
): Promise<CatalogMutationResult> {
  const validation = await validateCatalogName({
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

export async function updateExperienceLevel(
  experienceLevelId: string,
  input: CatalogNameInput,
): Promise<CatalogMutationResult> {
  const experienceLevel = await db.query.experienceLevels.findFirst({
    where: eq(experienceLevels.id, experienceLevelId),
  });

  if (!experienceLevel) {
    return catalogNotFound("experience-level");
  }

  const validation = await validateCatalogName({
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
): Promise<CatalogDeleteResult> {
  const experienceLevel = await db.query.experienceLevels.findFirst({
    where: eq(experienceLevels.id, experienceLevelId),
  });

  if (!experienceLevel) {
    return catalogNotFound("experience-level");
  }

  if (await experienceLevelHasCategoryDependencies(experienceLevelId)) {
    return {
      ok: false,
      code: "catalog-has-dependencies",
      error:
        "No se puede borrar el Nivel de experiencia porque tiene Categorías relacionadas.",
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
): Promise<CatalogMutationResult> {
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
): Promise<CatalogMutationResult> {
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
): Promise<CatalogDeleteResult> {
  const category = await db.query.categories.findFirst({
    where: eq(categories.id, categoryId),
  });

  if (!category) {
    return categoryNotFound();
  }

  await db.delete(categories).where(eq(categories.id, categoryId));

  return { ok: true };
}

export async function listScheduleBlocks(
  eventId: string,
): Promise<ScheduleBlockListItem[]> {
  const blocks = await db.query.scheduleBlocks.findMany({
    where: eq(scheduleBlocks.eventId, eventId),
    orderBy: [
      asc(scheduleBlocks.scheduledDate),
      asc(scheduleBlocks.startTime),
      asc(scheduleBlocks.name),
    ],
  });

  if (blocks.length === 0) {
    return [];
  }

  const blockIds = blocks.map((block) => block.id);
  const [acceptedModalities, blockScheduleEntries] = await Promise.all([
    db
      .select({
        blockId: scheduleBlockModalities.scheduleBlockId,
        modalityId: modalities.id,
        modalityName: modalities.name,
      })
      .from(scheduleBlockModalities)
      .innerJoin(
        modalities,
        eq(scheduleBlockModalities.modalityId, modalities.id),
      )
      .where(inArray(scheduleBlockModalities.scheduleBlockId, blockIds))
      .orderBy(asc(modalities.name)),
    db.query.scheduleEntries.findMany({
      where: inArray(scheduleEntries.scheduleBlockId, blockIds),
      orderBy: [
        asc(scheduleEntries.groupTypeKey),
        asc(scheduleEntries.capacity),
      ],
    }),
  ]);

  const modalitiesByBlockId = groupScheduleBlockModalities(acceptedModalities);
  const entriesByBlockId = groupScheduleEntries(blockScheduleEntries);

  return blocks.map((block) => {
    const blockModalities = modalitiesByBlockId.get(block.id) ?? [];
    return {
      ...block,
      modalities: blockModalities,
      modalityIds: blockModalities.map((modality) => modality.id),
      scheduleEntries: entriesByBlockId.get(block.id) ?? [],
    };
  });
}

export async function createScheduleBlock(
  eventId: string,
  input: ScheduleBlockInput,
): Promise<CatalogMutationResult> {
  const validation = await validateScheduleBlockInput(eventId, input);

  if (!validation.ok) {
    return validation;
  }

  return db.transaction(async (tx): Promise<CatalogMutationResult> => {
    const [record] = await tx
      .insert(scheduleBlocks)
      .values({
        eventId,
        name: input.name.trim(),
        scheduledDate: input.scheduledDate,
        startTime: normalizeTime(input.startTime),
        totalCapacity: input.totalCapacity,
      })
      .returning();

    if (!record) {
      return {
        ok: false,
        code: "invalid-catalog",
        error: "No se pudo guardar el Bloque horario.",
      };
    }

    await tx
      .insert(scheduleBlockModalities)
      .values(getScheduleBlockModalityValues(record.id, input.modalityIds));

    return created(record);
  });
}

export async function updateScheduleBlock(
  scheduleBlockId: string,
  input: ScheduleBlockInput,
  dependencies: ScheduleBlockDependencies = {},
): Promise<CatalogMutationResult> {
  const existing = await getScheduleBlockWithModalityIds(scheduleBlockId);

  if (!existing) {
    return catalogNotFound("schedule-block");
  }

  const validation = await validateScheduleBlockInput(existing.eventId, input, {
    exceptId: scheduleBlockId,
  });

  if (!validation.ok) {
    return validation;
  }

  const hasDependencies =
    dependencies.hasDependencies ?? scheduleBlockHasOperationalDependencies;

  if (
    (await hasDependencies(scheduleBlockId)) &&
    hasStructuralScheduleBlockChanges(existing, input)
  ) {
    return {
      ok: false,
      code: "schedule-block-has-dependencies",
      error:
        "No se pueden editar fecha, hora, cupo total ni Modalidades aceptadas porque el Bloque horario tiene dependencias.",
    };
  }

  return db.transaction(async (tx): Promise<CatalogMutationResult> => {
    const [record] = await tx
      .update(scheduleBlocks)
      .set({
        name: input.name.trim(),
        scheduledDate: input.scheduledDate,
        startTime: normalizeTime(input.startTime),
        totalCapacity: input.totalCapacity,
      })
      .where(eq(scheduleBlocks.id, scheduleBlockId))
      .returning();

    if (!record) {
      return catalogNotFound("schedule-block");
    }

    await tx
      .delete(scheduleBlockModalities)
      .where(eq(scheduleBlockModalities.scheduleBlockId, scheduleBlockId));
    await tx
      .insert(scheduleBlockModalities)
      .values(
        getScheduleBlockModalityValues(scheduleBlockId, input.modalityIds),
      );

    return created(record);
  });
}

export async function deleteScheduleBlock(
  scheduleBlockId: string,
  dependencies: ScheduleBlockDependencies = {},
): Promise<CatalogDeleteResult> {
  const scheduleBlock = await db.query.scheduleBlocks.findFirst({
    where: eq(scheduleBlocks.id, scheduleBlockId),
  });

  if (!scheduleBlock) {
    return catalogNotFound("schedule-block");
  }

  const hasDependencies =
    dependencies.hasDependencies ?? scheduleBlockHasOperationalDependencies;

  if (await hasDependencies(scheduleBlockId)) {
    return {
      ok: false,
      code: "schedule-block-has-dependencies",
      error: "No se puede borrar el Bloque horario porque tiene dependencias.",
    };
  }

  if (await scheduleBlockHasScheduleEntries(scheduleBlockId)) {
    return {
      ok: false,
      code: "schedule-block-has-dependencies",
      error:
        "No se puede borrar el Bloque horario porque tiene Cronogramas relacionados.",
    };
  }

  await db.delete(scheduleBlocks).where(eq(scheduleBlocks.id, scheduleBlockId));

  return { ok: true };
}

export async function scheduleBlockHasOperationalDependencies(
  scheduleBlockId: string,
) {
  const price = await db.query.prices.findFirst({
    columns: { id: true },
    where: eq(prices.scheduleBlockId, scheduleBlockId),
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

  const blockIds = uniqueValues(
    eventPrices
      .map((price) => price.scheduleBlockId)
      .filter((id): id is string => Boolean(id)),
  );
  const blocks =
    blockIds.length > 0
      ? await db.query.scheduleBlocks.findMany({
          where: inArray(scheduleBlocks.id, blockIds),
          orderBy: [
            asc(scheduleBlocks.scheduledDate),
            asc(scheduleBlocks.startTime),
            asc(scheduleBlocks.name),
          ],
        })
      : [];
  const blocksById = new Map(blocks.map((block) => [block.id, block]));

  return eventPrices
    .map((price) => ({
      ...price,
      scheduleBlock: price.scheduleBlockId
        ? (blocksById.get(price.scheduleBlockId) ?? null)
        : null,
    }))
    .sort(comparePrices);
}

export async function createPrice(
  eventId: string,
  input: PriceInput,
): Promise<CatalogMutationResult> {
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
): Promise<CatalogMutationResult> {
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
      code: "catalog-has-dependencies",
      error:
        "No se pueden editar monto, Tipo de grupo ni Bloque horario porque el Precio tiene dependencias.",
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
): Promise<CatalogDeleteResult> {
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
      code: "catalog-has-dependencies",
      error: "No se puede borrar el Precio porque tiene dependencias.",
    };
  }

  await db.delete(prices).where(eq(prices.id, priceId));

  return { ok: true };
}

export async function resolveApplicablePrice(input: {
  eventId: string;
  groupType: string;
  scheduleBlockId: string | null;
}): Promise<PriceResolutionResult> {
  if (!isGroupType(input.groupType)) {
    return {
      ok: false,
      code: "invalid-group-type",
      error: "No se pudo resolver el Precio para ese Tipo de grupo.",
    };
  }

  if (input.scheduleBlockId) {
    const specificPrice = await db.query.prices.findFirst({
      where: and(
        eq(prices.eventId, input.eventId),
        eq(prices.groupType, input.groupType),
        eq(prices.scheduleBlockId, input.scheduleBlockId),
      ),
    });

    if (specificPrice) {
      return { ok: true, price: specificPrice };
    }
  }

  const generalPrice = await db.query.prices.findFirst({
    where: and(
      eq(prices.eventId, input.eventId),
      eq(prices.groupType, input.groupType),
      isNull(prices.scheduleBlockId),
    ),
  });

  if (generalPrice) {
    return { ok: true, price: generalPrice };
  }

  return {
    ok: false,
    code: "missing-price",
    error:
      "No hay un Precio configurado para este Tipo de grupo y Bloque horario.",
  };
}

export async function priceHasOperationalDependencies(_priceId: string) {
  return false;
}

export async function createScheduleEntry(
  scheduleBlockId: string,
  input: ScheduleEntryInput,
): Promise<CatalogMutationResult> {
  const validation = await validateScheduleEntryInput(scheduleBlockId, input);

  if (!validation.ok) {
    return validation;
  }

  const [record] = await db
    .insert(scheduleEntries)
    .values({
      scheduleBlockId,
      groupTypes: validation.groupTypes,
      groupTypeKey: validation.groupTypeKey,
      capacity: input.capacity,
    })
    .returning();

  return created(record);
}

export async function updateScheduleEntry(
  scheduleEntryId: string,
  input: ScheduleEntryInput,
  dependencies: ScheduleEntryDependencies = {},
): Promise<CatalogMutationResult> {
  const existing = await db.query.scheduleEntries.findFirst({
    where: eq(scheduleEntries.id, scheduleEntryId),
  });

  if (!existing) {
    return scheduleEntryNotFound();
  }

  const validation = await validateScheduleEntryInput(
    existing.scheduleBlockId,
    input,
    scheduleEntryId,
  );

  if (!validation.ok) {
    return validation;
  }

  const hasDependencies =
    dependencies.hasDependencies ?? scheduleEntryHasOperationalDependencies;

  if (
    (await hasDependencies(scheduleEntryId)) &&
    hasStructuralScheduleEntryChanges(existing, {
      groupTypeKey: validation.groupTypeKey,
      capacity: input.capacity,
    })
  ) {
    return {
      ok: false,
      code: "invalid-schedule-entry",
      error:
        "No se pueden editar Tipos de grupo ni cupo porque el Cronograma tiene dependencias.",
    };
  }

  const [record] = await db
    .update(scheduleEntries)
    .set({
      groupTypes: validation.groupTypes,
      groupTypeKey: validation.groupTypeKey,
      capacity: input.capacity,
    })
    .where(eq(scheduleEntries.id, scheduleEntryId))
    .returning();

  return created(record);
}

export async function deleteScheduleEntry(
  scheduleEntryId: string,
  dependencies: ScheduleEntryDependencies = {},
): Promise<CatalogDeleteResult> {
  const scheduleEntry = await db.query.scheduleEntries.findFirst({
    where: eq(scheduleEntries.id, scheduleEntryId),
  });

  if (!scheduleEntry) {
    return scheduleEntryNotFound();
  }

  const hasDependencies =
    dependencies.hasDependencies ?? scheduleEntryHasOperationalDependencies;

  if (await hasDependencies(scheduleEntryId)) {
    return {
      ok: false,
      code: "invalid-schedule-entry",
      error: "No se puede borrar el Cronograma porque tiene dependencias.",
    };
  }

  await db
    .delete(scheduleEntries)
    .where(eq(scheduleEntries.id, scheduleEntryId));

  return { ok: true };
}

export async function scheduleEntryHasOperationalDependencies(
  _scheduleEntryId: string,
) {
  return false;
}

export async function resolveCompatibleScheduleEntries(input: {
  eventId: string;
  modalityId: string;
  groupType: string;
}): Promise<CompatibleScheduleEntryResolution> {
  if (!isGroupType(input.groupType)) {
    return {
      status: "none",
      error: "Elegí un Tipo de grupo válido.",
      options: [],
    };
  }

  const compatibleOptions = await findCompatibleScheduleEntries({
    eventId: input.eventId,
    modalityId: input.modalityId,
    groupType: input.groupType,
  });

  if (compatibleOptions.length === 0) {
    return {
      status: "none",
      error:
        "No hay Cronogramas compatibles para la Modalidad y el Tipo de grupo seleccionados.",
      options: [],
    };
  }

  if (compatibleOptions.length === 1) {
    return {
      status: "auto",
      scheduleEntry: compatibleOptions[0],
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
): Promise<{ ok: true } | CatalogFailure> {
  const nameValidation = await validateCatalogName({
    eventId,
    name: input.name,
    kind: "submodality",
    exceptId,
  });

  if (!nameValidation.ok) {
    return nameValidation;
  }

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
      error: "Elegí una Modalidad del Evento de trabajo.",
      fieldErrors: {
        modalityId: "Elegí una Modalidad del Evento de trabajo.",
      },
    };
  }

  return { ok: true };
}

async function validateCatalogName(input: {
  eventId: string;
  name: string;
  kind: CatalogKind;
  exceptId?: string;
}): Promise<{ ok: true } | CatalogFailure> {
  if (input.name.trim().length === 0) {
    return {
      ok: false,
      code: "invalid-catalog",
      error: catalogCopy[input.kind].invalidError,
      fieldErrors: { name: catalogCopy[input.kind].requiredNameError },
    };
  }

  const duplicate = await findDuplicateName(input);

  if (duplicate) {
    return {
      ok: false,
      code: "duplicate-name",
      error: catalogCopy[input.kind].duplicateError,
      fieldErrors: { name: catalogCopy[input.kind].duplicateFieldError },
    };
  }

  return { ok: true };
}

async function validateScheduleBlockInput(
  eventId: string,
  input: ScheduleBlockInput,
  options: { exceptId?: string } = {},
): Promise<{ ok: true } | CatalogFailure> {
  const fieldErrors: Record<string, string> = {};
  const copy = catalogCopy["schedule-block"];

  if (input.name.trim().length === 0) {
    fieldErrors.name = copy.requiredNameError;
  }

  if (!isValidDate(input.scheduledDate)) {
    fieldErrors.scheduledDate = "Ingresá una fecha válida.";
  }

  if (!isValidTime(input.startTime)) {
    fieldErrors.startTime = "Ingresá una hora válida.";
  }

  if (!Number.isInteger(input.totalCapacity) || input.totalCapacity <= 0) {
    fieldErrors.totalCapacity = "Ingresá un cupo total mayor a cero.";
  }

  const modalityIds = uniqueValues(input.modalityIds);

  if (modalityIds.length === 0) {
    fieldErrors.modalityIds = "Elegí al menos una Modalidad aceptada.";
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
      fieldErrors.modalityIds = "Elegí Modalidades del Evento de trabajo.";
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      code: "invalid-catalog",
      error: copy.invalidError,
      fieldErrors,
    };
  }

  const duplicate = await findDuplicateName({
    eventId,
    name: input.name,
    kind: "schedule-block",
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

  return { ok: true };
}

async function validatePriceInput(
  eventId: string,
  input: PriceInput,
  options: { exceptId?: string } = {},
): Promise<{ ok: true; input: ValidPriceInput } | CatalogFailure> {
  const fieldErrors: Record<string, string> = {};
  const name = input.name.trim();
  const scheduleBlockId = input.scheduleBlockId?.trim() || null;

  if (name.length === 0) {
    fieldErrors.name = "Ingresá el nombre del Precio.";
  }

  if (!isGroupType(input.groupType)) {
    fieldErrors.groupType = "Elegí un Tipo de grupo.";
  }

  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    fieldErrors.amount = "Ingresá un monto mayor a cero.";
  }

  if (scheduleBlockId) {
    const scheduleBlock = await db.query.scheduleBlocks.findFirst({
      columns: { id: true },
      where: and(
        eq(scheduleBlocks.id, scheduleBlockId),
        eq(scheduleBlocks.eventId, eventId),
      ),
    });

    if (!scheduleBlock) {
      fieldErrors.scheduleBlockId =
        "Elegí un Bloque horario del Evento de trabajo.";
    }
  }

  const fieldErrorKeys = Object.keys(fieldErrors);

  if (fieldErrorKeys.length > 0 || !isGroupType(input.groupType)) {
    const onlyScheduleBlockError =
      fieldErrorKeys.length === 1 && fieldErrorKeys[0] === "scheduleBlockId";

    return {
      ok: false,
      code: "invalid-catalog",
      error: onlyScheduleBlockError
        ? "Elegí un Bloque horario del Evento de trabajo."
        : "Revisá los datos del Precio.",
      fieldErrors,
    };
  }

  const validInput = {
    name,
    groupType: input.groupType,
    amount: input.amount,
    scheduleBlockId,
  };

  if (await findDuplicatePrice(eventId, validInput, options.exceptId)) {
    return {
      ok: false,
      code: "duplicate-name",
      error: scheduleBlockId
        ? "Ya existe un Precio para ese Tipo de grupo y Bloque horario."
        : "Ya existe un Precio general para ese Tipo de grupo.",
      fieldErrors: {
        groupType: "Revisá el Tipo de grupo del Precio.",
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
  const scheduleBlockFilter = input.scheduleBlockId
    ? eq(prices.scheduleBlockId, input.scheduleBlockId)
    : isNull(prices.scheduleBlockId);

  return db
    .select({ id: prices.id })
    .from(prices)
    .where(
      and(
        eq(prices.eventId, eventId),
        eq(prices.groupType, input.groupType),
        scheduleBlockFilter,
        idFilter,
      ),
    )
    .limit(1)
    .then(([record]) => record);
}

async function validateScheduleEntryInput(
  scheduleBlockId: string,
  input: ScheduleEntryInput,
  exceptId?: string,
): Promise<
  { ok: true; groupTypes: GroupType[]; groupTypeKey: string } | CatalogFailure
> {
  const scheduleBlock = await db.query.scheduleBlocks.findFirst({
    where: eq(scheduleBlocks.id, scheduleBlockId),
  });

  if (!scheduleBlock) {
    return scheduleEntryNotFound();
  }

  const fieldErrors: Record<string, string> = {};
  const groupTypes = uniqueValues(input.groupTypes)
    .filter(isGroupType)
    .sort((a, b) => groupTypeOrder.indexOf(a) - groupTypeOrder.indexOf(b));

  if (groupTypes.length === 0) {
    fieldErrors.groupTypes = "Elegí al menos un Tipo de grupo.";
  }

  if (!Number.isInteger(input.capacity) || input.capacity <= 0) {
    fieldErrors.capacity = "Ingresá un cupo mayor a cero.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      code: "invalid-schedule-entry",
      error: "Revisá los datos del Cronograma.",
      fieldErrors,
    };
  }

  const groupTypeKey = groupTypes.join("|");

  if (
    await findDuplicateScheduleEntry(scheduleBlockId, groupTypeKey, exceptId)
  ) {
    return {
      ok: false,
      code: "invalid-schedule-entry",
      error:
        "Ya existe un Cronograma para esa combinación de Tipos de grupo en este Bloque horario.",
      fieldErrors: {
        groupTypes: "Revisá los Tipos de grupo del Cronograma.",
      },
    };
  }

  const reservedCapacity = await getReservedScheduleEntryCapacity(
    scheduleBlockId,
    exceptId,
  );

  if (reservedCapacity + input.capacity > scheduleBlock.totalCapacity) {
    return {
      ok: false,
      code: "invalid-schedule-entry",
      error:
        "La suma de cupos de Cronogramas no puede superar el cupo total del Bloque horario.",
      fieldErrors: { capacity: "Ajustá el cupo del Cronograma." },
    };
  }

  return { ok: true, groupTypes, groupTypeKey };
}

async function validateCategoryInput(
  eventId: string,
  input: CategoryInput,
  exceptId?: string,
): Promise<{ ok: true; input: ValidCategoryInput } | CatalogFailure> {
  const name = input.name.trim();

  if (name.length === 0) {
    return {
      ok: false,
      code: "invalid-catalog",
      error: "Revisá los datos de la Categoría.",
      fieldErrors: { name: "Ingresá el nombre de la Categoría." },
    };
  }

  if (!Number.isInteger(input.minAge) || !Number.isInteger(input.maxAge)) {
    return {
      ok: false,
      code: "invalid-catalog",
      error: "Revisá las edades de la Categoría.",
      fieldErrors: { ageRange: "Ingresá edades válidas." },
    };
  }

  if (input.minAge < 0 || input.maxAge < input.minAge) {
    return {
      ok: false,
      code: "invalid-catalog",
      error: "Revisá las edades de la Categoría.",
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
      error: "Elegí al menos un Tipo de grupo.",
      fieldErrors: { groupTypes: "Elegí al menos un Tipo de grupo." },
    };
  }

  const modalityIds = uniqueValues(input.modalityIds);

  if (modalityIds.length === 0) {
    return {
      ok: false,
      code: "invalid-modality",
      error: "Elegí al menos una Modalidad.",
      fieldErrors: { modalityIds: "Elegí al menos una Modalidad." },
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
      error: "Elegí Modalidades del Evento de trabajo.",
      fieldErrors: {
        modalityIds: "Elegí Modalidades del Evento de trabajo.",
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
        error: "Elegí Niveles de experiencia del Evento de trabajo.",
        fieldErrors: {
          experienceLevelIds:
            "Elegí Niveles de experiencia del Evento de trabajo.",
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
      error: "Ya existe una Categoría equivalente en este Evento.",
      fieldErrors: { name: "Revisá la combinación de la Categoría." },
    };
  }

  if (await findOverlappingCategory(eventId, validInput, exceptId)) {
    return {
      ok: false,
      code: "invalid-catalog",
      error:
        "La Categoría se solapa con otra Categoría para la misma Modalidad y Tipo de grupo.",
      fieldErrors: { ageRange: "Ajustá las edades o la aplicabilidad." },
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

  return db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        eq(categories.eventId, eventId),
        sql`lower(${categories.name}) = ${input.name.toLowerCase()}`,
        eq(categories.minAge, input.minAge),
        eq(categories.maxAge, input.maxAge),
        eq(categories.groupTypeKey, input.groupTypeKey),
        eq(categories.experienceLevelKey, input.experienceLevelKey),
        idFilter,
      ),
    )
    .limit(1)
    .then(([record]) => record);
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
  kind: CatalogKind;
  exceptId?: string;
}) {
  const normalizedName = input.name.trim().toLowerCase();
  const table = getTable(input.kind);
  const idFilter = input.exceptId ? ne(table.id, input.exceptId) : undefined;
  const filters = [
    eq(table.eventId, input.eventId),
    sql`lower(${table.name}) = ${normalizedName}`,
    idFilter,
  ].filter(Boolean);

  return db
    .select({ id: table.id })
    .from(table)
    .where(and(...filters))
    .limit(1)
    .then(([record]) => record);
}

async function findCompatibleScheduleEntries(input: {
  eventId: string;
  modalityId: string;
  groupType: GroupType;
}): Promise<CompatibleScheduleEntry[]> {
  const rows = await db
    .select({
      id: scheduleEntries.id,
      scheduleBlockId: scheduleEntries.scheduleBlockId,
      groupTypes: scheduleEntries.groupTypes,
      groupTypeKey: scheduleEntries.groupTypeKey,
      capacity: scheduleEntries.capacity,
      createdAt: scheduleEntries.createdAt,
      blockId: scheduleBlocks.id,
      blockName: scheduleBlocks.name,
      blockDate: scheduleBlocks.scheduledDate,
      blockTime: scheduleBlocks.startTime,
    })
    .from(scheduleEntries)
    .innerJoin(
      scheduleBlocks,
      eq(scheduleEntries.scheduleBlockId, scheduleBlocks.id),
    )
    .innerJoin(
      scheduleBlockModalities,
      eq(scheduleBlocks.id, scheduleBlockModalities.scheduleBlockId),
    )
    .where(
      and(
        eq(scheduleBlocks.eventId, input.eventId),
        eq(scheduleBlockModalities.modalityId, input.modalityId),
        sql`${scheduleEntries.groupTypes} @> ARRAY[${input.groupType}]::en_escena_group_type[]`,
      ),
    )
    .orderBy(
      asc(scheduleBlocks.scheduledDate),
      asc(scheduleBlocks.startTime),
      asc(scheduleEntries.groupTypeKey),
    );

  return rows.map(toCompatibleScheduleEntry);
}

function toCompatibleScheduleEntry(
  row: CompatibleScheduleEntryRow,
): CompatibleScheduleEntry {
  return {
    id: row.id,
    scheduleBlockId: row.scheduleBlockId,
    groupTypes: row.groupTypes,
    groupTypeKey: row.groupTypeKey,
    capacity: row.capacity,
    createdAt: row.createdAt,
    scheduleBlock: {
      id: row.blockId,
      name: row.blockName,
      scheduledDate: row.blockDate,
      startTime: row.blockTime,
    },
  };
}

async function findDuplicateScheduleEntry(
  scheduleBlockId: string,
  groupTypeKey: string,
  exceptId?: string,
) {
  const idFilter = exceptId ? ne(scheduleEntries.id, exceptId) : undefined;

  return db
    .select({ id: scheduleEntries.id })
    .from(scheduleEntries)
    .where(
      and(
        eq(scheduleEntries.scheduleBlockId, scheduleBlockId),
        eq(scheduleEntries.groupTypeKey, groupTypeKey),
        idFilter,
      ),
    )
    .limit(1)
    .then(([record]) => record);
}

async function getReservedScheduleEntryCapacity(
  scheduleBlockId: string,
  exceptId?: string,
) {
  const idFilter = exceptId ? ne(scheduleEntries.id, exceptId) : undefined;
  const [result] = await db
    .select({
      total: sql<number>`coalesce(sum(${scheduleEntries.capacity}), 0)::int`,
    })
    .from(scheduleEntries)
    .where(and(eq(scheduleEntries.scheduleBlockId, scheduleBlockId), idFilter));

  return result?.total ?? 0;
}

async function scheduleBlockHasScheduleEntries(scheduleBlockId: string) {
  const scheduleEntry = await db.query.scheduleEntries.findFirst({
    columns: { id: true },
    where: eq(scheduleEntries.scheduleBlockId, scheduleBlockId),
  });

  return Boolean(scheduleEntry);
}

async function modalityHasConfigurationDependencies(
  modalityId: string,
): Promise<CatalogDeleteResult> {
  const submodality = await db.query.submodalities.findFirst({
    columns: { id: true },
    where: eq(submodalities.modalityId, modalityId),
  });

  if (submodality) {
    return {
      ok: false,
      code: "catalog-has-dependencies",
      error:
        "No se puede borrar la Modalidad porque tiene Submodalidades relacionadas.",
    };
  }

  const categoryRelation = await db.query.categoryModalities.findFirst({
    columns: { categoryId: true },
    where: eq(categoryModalities.modalityId, modalityId),
  });

  if (categoryRelation) {
    return {
      ok: false,
      code: "catalog-has-dependencies",
      error:
        "No se puede borrar la Modalidad porque tiene Categorías relacionadas.",
    };
  }

  const scheduleBlockRelation =
    await db.query.scheduleBlockModalities.findFirst({
      columns: { scheduleBlockId: true },
      where: eq(scheduleBlockModalities.modalityId, modalityId),
    });

  if (scheduleBlockRelation) {
    return {
      ok: false,
      code: "catalog-has-dependencies",
      error:
        "No se puede borrar la Modalidad porque tiene Bloques horarios relacionados.",
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
  tx: CatalogTransaction,
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

function created(record: CatalogRecord | undefined): CatalogMutationResult {
  if (!record) {
    return {
      ok: false,
      code: "invalid-catalog",
      error: "No se pudo guardar el catálogo.",
    };
  }

  return { ok: true, record };
}

function catalogNotFound(kind: CatalogKind): CatalogFailure {
  return {
    ok: false,
    code: "catalog-not-found",
    error: `No encontramos esa ${catalogCopy[kind].label}.`,
  };
}

function categoryNotFound(): CatalogFailure {
  return {
    ok: false,
    code: "catalog-not-found",
    error: "No encontramos esa Categoría.",
  };
}

function priceNotFound(): CatalogFailure {
  return {
    ok: false,
    code: "catalog-not-found",
    error: "No encontramos ese Precio.",
  };
}

function scheduleEntryNotFound(): CatalogFailure {
  return {
    ok: false,
    code: "catalog-not-found",
    error: "No encontramos ese Cronograma.",
  };
}

function getTable(kind: CatalogKind) {
  switch (kind) {
    case "modality":
      return modalities;
    case "submodality":
      return submodalities;
    case "experience-level":
      return experienceLevels;
    case "schedule-block":
      return scheduleBlocks;
  }
}

function uniqueValues(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
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

async function getScheduleBlockWithModalityIds(scheduleBlockId: string) {
  const scheduleBlock = await db.query.scheduleBlocks.findFirst({
    where: eq(scheduleBlocks.id, scheduleBlockId),
  });

  if (!scheduleBlock) {
    return null;
  }

  const acceptedModalities = await db.query.scheduleBlockModalities.findMany({
    columns: { modalityId: true },
    where: eq(scheduleBlockModalities.scheduleBlockId, scheduleBlockId),
  });

  return {
    ...scheduleBlock,
    modalityIds: acceptedModalities.map((modality) => modality.modalityId),
  };
}

function hasStructuralScheduleBlockChanges(
  existing: typeof scheduleBlocks.$inferSelect & { modalityIds: string[] },
  input: ScheduleBlockInput,
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
    existing.scheduleBlockId !== input.scheduleBlockId
  );
}

function comparePrices(first: PriceListItem, second: PriceListItem) {
  const groupTypeComparison =
    groupTypeOrder.indexOf(first.groupType) -
    groupTypeOrder.indexOf(second.groupType);

  if (groupTypeComparison !== 0) {
    return groupTypeComparison;
  }

  if (first.scheduleBlock && !second.scheduleBlock) {
    return -1;
  }

  if (!first.scheduleBlock && second.scheduleBlock) {
    return 1;
  }

  const firstBlockKey = first.scheduleBlock
    ? `${first.scheduleBlock.scheduledDate}\0${first.scheduleBlock.startTime}\0${first.scheduleBlock.name}`
    : "";
  const secondBlockKey = second.scheduleBlock
    ? `${second.scheduleBlock.scheduledDate}\0${second.scheduleBlock.startTime}\0${second.scheduleBlock.name}`
    : "";
  const blockComparison = firstBlockKey.localeCompare(secondBlockKey);

  if (blockComparison !== 0) {
    return blockComparison;
  }

  return first.name.localeCompare(second.name);
}

function hasStructuralScheduleEntryChanges(
  existing: typeof scheduleEntries.$inferSelect,
  input: { groupTypeKey: string; capacity: number },
) {
  return (
    existing.groupTypeKey !== input.groupTypeKey ||
    existing.capacity !== input.capacity
  );
}

function getScheduleBlockModalityValues(
  scheduleBlockId: string,
  modalityIds: string[],
) {
  return uniqueValues(modalityIds).map((modalityId) => ({
    scheduleBlockId,
    modalityId,
  }));
}

function groupScheduleBlockModalities(
  acceptedModalities: Array<{
    blockId: string;
    modalityId: string;
    modalityName: string;
  }>,
) {
  const modalitiesByBlockId = new Map<
    string,
    Array<Pick<typeof modalities.$inferSelect, "id" | "name">>
  >();

  for (const modality of acceptedModalities) {
    const blockModalities = modalitiesByBlockId.get(modality.blockId) ?? [];

    blockModalities.push({
      id: modality.modalityId,
      name: modality.modalityName,
    });
    modalitiesByBlockId.set(modality.blockId, blockModalities);
  }

  return modalitiesByBlockId;
}

function groupScheduleEntries(entries: ScheduleEntryListItem[]) {
  const entriesByBlockId = new Map<string, ScheduleEntryListItem[]>();

  for (const entry of entries) {
    const blockEntries = entriesByBlockId.get(entry.scheduleBlockId) ?? [];

    blockEntries.push(entry);
    entriesByBlockId.set(entry.scheduleBlockId, blockEntries);
  }

  return entriesByBlockId;
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

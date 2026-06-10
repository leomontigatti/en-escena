import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  categories,
  categoryExperienceLevels,
  categoryModalities,
  experienceLevels,
  modalities,
  submodalities,
} from "@/db/schema";

type CatalogKind = "modality" | "submodality" | "experience-level";
type GroupType = "solo" | "duo" | "trio" | "grupal";
const groupTypeOrder: GroupType[] = ["solo", "duo", "trio", "grupal"];

type CatalogRecord =
  | typeof modalities.$inferSelect
  | typeof submodalities.$inferSelect
  | typeof experienceLevels.$inferSelect
  | typeof categories.$inferSelect;

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
    | "invalid-modality";
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

type CatalogTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

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

function getTable(kind: CatalogKind) {
  switch (kind) {
    case "modality":
      return modalities;
    case "submodality":
      return submodalities;
    case "experience-level":
      return experienceLevels;
  }
}

function uniqueValues(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
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

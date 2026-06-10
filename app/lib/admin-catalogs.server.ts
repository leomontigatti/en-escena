import { and, asc, eq, ne, sql } from "drizzle-orm";

import { db } from "@/db";
import { experienceLevels, modalities, submodalities } from "@/db/schema";

type CatalogKind = "modality" | "submodality" | "experience-level";

type CatalogRecord =
  | typeof modalities.$inferSelect
  | typeof submodalities.$inferSelect
  | typeof experienceLevels.$inferSelect;

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
    | "invalid-catalog"
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

export async function listEventCatalogs(eventId: string) {
  const [eventModalities, eventSubmodalities, eventExperienceLevels] =
    await Promise.all([
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
    ]);

  return {
    modalities: eventModalities,
    submodalities: eventSubmodalities,
    experienceLevels: eventExperienceLevels,
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
    return catalogNotFound("Modalidad");
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
    return catalogNotFound("Modalidad");
  }

  if (await modalityHasConfigurationDependencies(modalityId)) {
    return {
      ok: false,
      code: "catalog-has-dependencies",
      error:
        "No se puede borrar la Modalidad porque tiene Submodalidades relacionadas.",
    };
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
    return catalogNotFound("Submodalidad");
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
    return catalogNotFound("Submodalidad");
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
    return catalogNotFound("Nivel de experiencia");
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
    return catalogNotFound("Nivel de experiencia");
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
      error: invalidCatalogError(input.kind),
      fieldErrors: { name: requiredNameError(input.kind) },
    };
  }

  const duplicate = await findDuplicateName(input);

  if (duplicate) {
    return {
      ok: false,
      code: "duplicate-name",
      error: duplicateNameError(input.kind),
      fieldErrors: { name: duplicateNameFieldError(input.kind) },
    };
  }

  return { ok: true };
}

async function findDuplicateName(input: {
  eventId: string;
  name: string;
  kind: CatalogKind;
  exceptId?: string;
}) {
  const normalizedName = input.name.trim().toLowerCase();
  const idFilter = input.exceptId
    ? ne(getTable(input.kind).id, input.exceptId)
    : undefined;
  const filters = [
    eq(getTable(input.kind).eventId, input.eventId),
    sql`lower(${getTable(input.kind).name}) = ${normalizedName}`,
    idFilter,
  ].filter(Boolean);

  return db
    .select({ id: getTable(input.kind).id })
    .from(getTable(input.kind))
    .where(and(...filters))
    .limit(1)
    .then(([record]) => record);
}

async function modalityHasConfigurationDependencies(modalityId: string) {
  const submodality = await db.query.submodalities.findFirst({
    columns: { id: true },
    where: eq(submodalities.modalityId, modalityId),
  });

  return Boolean(submodality);
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

function catalogNotFound(label: string): CatalogFailure {
  return {
    ok: false,
    code: "catalog-not-found",
    error: `No encontramos esa ${label}.`,
  };
}

function getTable(kind: CatalogKind) {
  if (kind === "modality") {
    return modalities;
  }

  if (kind === "submodality") {
    return submodalities;
  }

  return experienceLevels;
}

function invalidCatalogError(kind: CatalogKind) {
  if (kind === "modality") {
    return "Revisá los datos de la Modalidad.";
  }

  if (kind === "submodality") {
    return "Revisá los datos de la Submodalidad.";
  }

  return "Revisá los datos del Nivel de experiencia.";
}

function requiredNameError(kind: CatalogKind) {
  if (kind === "modality") {
    return "Ingresá el nombre de la Modalidad.";
  }

  if (kind === "submodality") {
    return "Ingresá el nombre de la Submodalidad.";
  }

  return "Ingresá el nombre del Nivel de experiencia.";
}

function duplicateNameError(kind: CatalogKind) {
  if (kind === "modality") {
    return "Ya existe una Modalidad con ese nombre en este Evento.";
  }

  if (kind === "submodality") {
    return "Ya existe una Submodalidad con ese nombre en este Evento.";
  }

  return "Ya existe un Nivel de experiencia con ese nombre en este Evento.";
}

function duplicateNameFieldError(kind: CatalogKind) {
  if (kind === "modality") {
    return "Usá un nombre distinto para la Modalidad.";
  }

  if (kind === "submodality") {
    return "Usá un nombre distinto para la Submodalidad.";
  }

  return "Usá un nombre distinto para el Nivel de experiencia.";
}

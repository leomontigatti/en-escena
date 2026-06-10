import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  experienceLevels,
  modalities,
  scheduleBlockModalities,
  scheduleBlocks,
  submodalities,
} from "@/db/schema";

type CatalogKind =
  | "modality"
  | "submodality"
  | "experience-level"
  | "schedule-block";

type CatalogRecord =
  | typeof modalities.$inferSelect
  | typeof scheduleBlocks.$inferSelect
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
    | "invalid-modality"
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

export type ScheduleBlockInput = CatalogNameInput & {
  scheduledDate: string;
  startTime: string;
  totalCapacity: number;
  modalityIds: string[];
};

type ScheduleBlockDependencies = {
  hasDependencies?: (scheduleBlockId: string) => Promise<boolean> | boolean;
};

export type ScheduleBlockListItem = typeof scheduleBlocks.$inferSelect & {
  modalities: Array<Pick<typeof modalities.$inferSelect, "id" | "name">>;
  modalityIds: string[];
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
    eventScheduleBlocks,
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
    listScheduleBlocks(eventId),
  ]);

  return {
    modalities: eventModalities,
    submodalities: eventSubmodalities,
    experienceLevels: eventExperienceLevels,
    scheduleBlocks: eventScheduleBlocks,
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

  if (await modalityHasConfigurationDependencies(modalityId)) {
    return {
      ok: false,
      code: "catalog-has-dependencies",
      error:
        "No se puede borrar la Modalidad porque tiene configuración relacionada.",
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

  await db
    .delete(experienceLevels)
    .where(eq(experienceLevels.id, experienceLevelId));

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
  const acceptedModalities = await db
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
    .orderBy(asc(modalities.name));

  return blocks.map((block) => {
    const blockModalities = acceptedModalities
      .filter((modality) => modality.blockId === block.id)
      .map((modality) => ({
        id: modality.modalityId,
        name: modality.modalityName,
      }));

    return {
      ...block,
      modalities: blockModalities,
      modalityIds: blockModalities.map((modality) => modality.id),
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

    await tx.insert(scheduleBlockModalities).values(
      uniqueIds(input.modalityIds).map((modalityId) => ({
        scheduleBlockId: record.id,
        modalityId,
      })),
    );

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
    await tx.insert(scheduleBlockModalities).values(
      uniqueIds(input.modalityIds).map((modalityId) => ({
        scheduleBlockId,
        modalityId,
      })),
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

  await db.delete(scheduleBlocks).where(eq(scheduleBlocks.id, scheduleBlockId));

  return { ok: true };
}

export async function scheduleBlockHasOperationalDependencies(
  _scheduleBlockId: string,
) {
  return false;
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

async function validateScheduleBlockInput(
  eventId: string,
  input: ScheduleBlockInput,
  options: { exceptId?: string } = {},
): Promise<{ ok: true } | CatalogFailure> {
  const fieldErrors: Record<string, string> = {};

  if (input.name.trim().length === 0) {
    fieldErrors.name = "Ingresá el nombre del Bloque horario.";
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

  const modalityIds = uniqueIds(input.modalityIds);

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

  const duplicate = await findDuplicateName({
    eventId,
    name: input.name,
    kind: "schedule-block",
    exceptId: options.exceptId,
  });

  if (duplicate) {
    fieldErrors.name = "Usá un nombre distinto para el Bloque horario.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      code: duplicate ? "duplicate-name" : "invalid-catalog",
      error: duplicate
        ? "Ya existe un Bloque horario con ese nombre en este Evento."
        : "Revisá los datos del Bloque horario.",
      fieldErrors,
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

async function modalityHasConfigurationDependencies(modalityId: string) {
  const [submodality, scheduleBlockModality] = await Promise.all([
    db.query.submodalities.findFirst({
      columns: { id: true },
      where: eq(submodalities.modalityId, modalityId),
    }),
    db.query.scheduleBlockModalities.findFirst({
      columns: { scheduleBlockId: true },
      where: eq(scheduleBlockModalities.modalityId, modalityId),
    }),
  ]);

  return Boolean(submodality || scheduleBlockModality);
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

function catalogNotFound(kind: CatalogKind | "schedule-block"): CatalogFailure {
  return {
    ok: false,
    code: "catalog-not-found",
    error:
      kind === "schedule-block"
        ? "No encontramos ese Bloque horario."
        : `No encontramos esa ${catalogCopy[kind].label}.`,
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

function uniqueIds(ids: string[]) {
  return Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
}

function sortedIds(ids: string[]) {
  return uniqueIds(ids).sort((first, second) => first.localeCompare(second));
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

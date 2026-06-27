import { and, eq, inArray, ne, sql } from "drizzle-orm";

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

export {
  categories,
  categoryExperienceLevels,
  categoryModalities,
  db,
  experienceLevels,
  modalities,
  prices,
  requiredFieldMessage,
  scheduleCapacities,
  scheduleModalities,
  schedules,
  submodalities,
  toTitleCase,
};

export type EventBaseEntityKind = EventBaseUniqueEntityKind | "schedule";
export type EventBaseUniqueEntityKind =
  | "modality"
  | "submodality"
  | "experience-level";
export type GroupType = "solo" | "duo" | "trio" | "grupal";

export const groupTypeOrder: GroupType[] = ["solo", "duo", "trio", "grupal"];
export const priceDefaultNames: Record<GroupType, string> = {
  solo: "Precio Solo",
  duo: "Precio Duo",
  trio: "Precio Trio",
  grupal: "Precio Grupal",
};

export type EventBaseRecord =
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

export type EventBaseFailure = {
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

export type EventBaseNameInput = {
  name: string;
};

export type SubmodalityInput = EventBaseNameInput & {
  modalityId: string;
};

export type InlineSubmodalityInput = EventBaseNameInput & {
  id?: string;
};

export type ModalityWithSubmodalitiesInput = EventBaseNameInput & {
  submodalities: InlineSubmodalityInput[];
};

export type CategoryInput = EventBaseNameInput & {
  minAge: number;
  maxAge: number;
  groupTypes: string[];
  modalityIds: string[];
  experienceLevelIds: string[];
};

export type ValidCategoryInput = {
  name: string;
  minAge: number;
  maxAge: number;
  groupTypes: GroupType[];
  modalityIds: string[];
  experienceLevelIds: string[];
  groupTypeKey: string;
  experienceLevelKey: string;
};

export type ScheduleInput = EventBaseNameInput & {
  scheduledDate: string;
  startTime: string;
  totalCapacity: number;
  modalityIds: string[];
};

export type ScheduleCapacityInput = {
  groupType: string;
  capacity: number;
};

export type ValidInlineScheduleCapacityInput = {
  id?: string;
  index: number;
  groupType: GroupType;
  capacity: number;
};

export type ScheduleWithEntriesInput = ScheduleInput & {
  scheduleCapacities: Array<ScheduleCapacityInput & { id?: string }>;
};

export type ScheduleDependencies = {
  hasDependencies?: (scheduleId: string) => Promise<boolean> | boolean;
};

export type ScheduleCapacityDependencies = {
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
  name?: string;
  groupType: string;
  amount: number;
  paymentDeadline: string;
  scheduleId: string | null;
};

export type ValidPriceInput = {
  name: string;
  groupType: GroupType;
  amount: number;
  paymentDeadline: string;
  scheduleId: string | null;
};

export type PriceDependencies = {
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

export type ValidInlineSubmodalityInput = InlineSubmodalityInput & {
  index: number;
};

export type CategoryRelationRow = {
  categoryId: string;
};

export type CompatibleScheduleRow = Pick<
  typeof schedules.$inferSelect,
  "id" | "name" | "scheduledDate" | "startTime" | "totalCapacity" | "createdAt"
>;

export type EventBasesTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

export const eventBaseCopy = {
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
  },
} satisfies Record<
  EventBaseEntityKind,
  {
    label: string;
    invalidError: string;
    requiredNameError: string;
  }
> &
  Record<
    EventBaseUniqueEntityKind,
    {
      duplicateError: string;
      duplicateFieldError: string;
    }
  >;

export async function validateEventBaseName(input: {
  eventId: string;
  name: string;
  kind: EventBaseUniqueEntityKind;
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

async function findDuplicateName(input: {
  eventId: string;
  name: string;
  kind: EventBaseUniqueEntityKind;
  exceptId?: string;
}) {
  const normalizedName = normalizeEventBaseName(input.name);
  const table = getUniqueNameTable(input.kind);
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

export function normalizeEventBaseName(name: string) {
  return name
    .trim()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("es");
}

export function normalizeNullableName(name: string) {
  const trimmedName = name.trim();

  return trimmedName.length > 0 ? trimmedName : null;
}

export function created(
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

export function eventBaseEntityNotFound(
  kind: EventBaseEntityKind,
): EventBaseFailure {
  return {
    ok: false,
    code: "event-bases-not-found",
    error: `No encontramos esa ${eventBaseCopy[kind].label}.`,
  };
}

function getUniqueNameTable(kind: EventBaseUniqueEntityKind) {
  switch (kind) {
    case "modality":
      return modalities;
    case "submodality":
      return submodalities;
    case "experience-level":
      return experienceLevels;
  }
}

export function categoryNotFound(): EventBaseFailure {
  return {
    ok: false,
    code: "event-bases-not-found",
    error: "No encontramos esa categoría.",
  };
}

export function priceNotFound(): EventBaseFailure {
  return {
    ok: false,
    code: "event-bases-not-found",
    error: "No encontramos ese precio.",
  };
}

export function scheduleCapacityNotFound(): EventBaseFailure {
  return {
    ok: false,
    code: "event-bases-not-found",
    error: "No encontramos ese cupo de cronograma.",
  };
}

export function uniqueValues(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function haveSameValues(first: string[], second: string[]) {
  if (first.length !== second.length) {
    return false;
  }

  return first.every((value, index) => value === second[index]);
}

export function sortedIds(ids: string[]) {
  return uniqueValues(ids).sort((first, second) => first.localeCompare(second));
}

export function isGroupType(value: string): value is GroupType {
  return ["solo", "duo", "trio", "grupal"].includes(value);
}

export function categoryValues(input: ValidCategoryInput) {
  return {
    name: input.name,
    minAge: input.minAge,
    maxAge: input.maxAge,
    groupTypes: input.groupTypes,
    groupTypeKey: input.groupTypeKey,
    experienceLevelKey: input.experienceLevelKey,
  };
}

export function groupRelationIdsByCategory<
  TRelation extends CategoryRelationRow,
>(relations: TRelation[], getId: (relation: TRelation) => string) {
  const idsByCategory = new Map<string, string[]>();

  for (const relation of relations) {
    const ids = idsByCategory.get(relation.categoryId) ?? [];

    ids.push(getId(relation));
    idsByCategory.set(relation.categoryId, ids);
  }

  return idsByCategory;
}

export function toDateOnly(value: Date | string) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return value.slice(0, 10);
}

export function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);

  return (
    !Number.isNaN(date.getTime()) && value === date.toISOString().slice(0, 10)
  );
}

export function isValidTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function normalizeTime(value: string) {
  return value.slice(0, 5);
}

export async function replaceCategoryRelations(
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

export async function findExperienceLevelsByNames(
  eventId: string,
  names: string[],
) {
  return db.query.experienceLevels.findMany({
    where: and(
      eq(experienceLevels.eventId, eventId),
      inArray(
        sql`lower(${experienceLevels.name})`,
        names.map((name) => normalizeEventBaseName(name)),
      ),
    ),
  });
}

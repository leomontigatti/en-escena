import { and, eq, ne } from "drizzle-orm";

import { db } from "@/db";
import {
  categories,
  events,
  modalities,
  prices,
  scheduleCapacities,
  schedules,
  seminarPrices,
  submodalities,
} from "@/db/schema";

/**
 * What every `Bases del evento` resource shares, and nothing else: the result
 * contracts, the failure shape and its constructors, the entity-kind
 * vocabulary, the name rules and the rejection copy. A resource's own inputs,
 * list items and queries live with that resource (PRD #719).
 */

export type EventBaseEntityKind =
  | "modality"
  | "submodality"
  | "category"
  | "schedule"
  | "scheduleCapacity"
  | "price";

/**
 * The kinds whose identity within the event is their name. A category's
 * identity is its age range, group types and modalities, and a price's is its
 * group type and schedules, so neither goes through the name validator.
 */
export type EventBaseUniqueEntityKind = "modality" | "submodality";

export type EventBaseRecord =
  | typeof events.$inferSelect
  | typeof modalities.$inferSelect
  | typeof scheduleCapacities.$inferSelect
  | typeof schedules.$inferSelect
  | typeof submodalities.$inferSelect
  | typeof categories.$inferSelect
  | typeof prices.$inferSelect
  // Seminar prices are not `Bases del evento` —they live in their own resource
  // module— but they return these same result shapes, so the record union has
  // to admit their row (docs/domain/seminars.md, "Prices").
  | typeof seminarPrices.$inferSelect;

export type EventBaseFailure = {
  ok: false;
  code:
    | "event-bases-has-dependencies"
    | "event-bases-not-found"
    | "duplicate-name"
    | "duplicate-category"
    | "duplicate-price-group-schedule"
    | "duplicate-seminar-price"
    | "invalid-event-bases"
    | "invalid-experience-level"
    | "invalid-group-type"
    | "invalid-modality"
    | "missing-price"
    | "invalid-schedule-capacity"
    | "schedule-has-dependencies"
    | "schedule-registration-not-allowed";
  error: string;
  fieldErrors?: Record<string, string>;
};

export type EventBasesMutationResult<TRecord = EventBaseRecord> =
  { ok: true; record: TRecord } | EventBaseFailure;

export type EventBasesDeleteResult = { ok: true } | EventBaseFailure;

/**
 * The one source of every base's generic rejection sentence, read by the
 * persistence layer and by the admin action layer alike, so the administrator
 * reads the same words whichever layer refused the submission.
 */
export const eventBaseCopy = {
  modality: {
    invalidError: "Revisá los datos de la modalidad.",
    notFoundError: "No encontramos esa modalidad.",
    requiredNameError: "Ingresá el nombre de la modalidad.",
    duplicateError: "Ya existe una modalidad con ese nombre en este evento.",
    duplicateFieldError: "Usá un nombre distinto para la modalidad.",
  },
  submodality: {
    invalidError: "Revisá los datos de la submodalidad.",
    notFoundError: "No encontramos esa submodalidad.",
    requiredNameError: "Ingresá el nombre de la submodalidad.",
    duplicateError:
      "Ya existe una submodalidad con ese nombre en esta modalidad.",
    duplicateFieldError: "Usá un nombre distinto para la submodalidad.",
  },
  category: {
    invalidError: "Revisá los datos de la categoría.",
    notFoundError: "No encontramos esa categoría.",
    requiredNameError: "Ingresá el nombre de la categoría.",
  },
  schedule: {
    invalidError: "Revisá los datos del cronograma.",
    notFoundError: "No encontramos ese cronograma.",
  },
  scheduleCapacity: {
    invalidError: "Revisá los datos del cupo de cronograma.",
    notFoundError: "No encontramos ese cupo de cronograma.",
  },
  price: {
    invalidError: "Revisá los datos del precio.",
    notFoundError: "No encontramos ese precio.",
  },
} satisfies Record<
  EventBaseEntityKind,
  { invalidError: string; notFoundError: string; requiredNameError?: string }
> &
  Record<
    EventBaseUniqueEntityKind,
    {
      requiredNameError: string;
      duplicateError: string;
      duplicateFieldError: string;
    }
  >;

export function created<TRecord>(
  record: TRecord | undefined,
): EventBasesMutationResult<TRecord> {
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
    error: eventBaseCopy[kind].notFoundError,
  };
}

export function normalizeEventBaseName(name: string) {
  return name
    .trim()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("es");
}

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

function getUniqueNameTable(kind: EventBaseUniqueEntityKind) {
  switch (kind) {
    case "modality":
      return modalities;
    case "submodality":
      return submodalities;
  }
}

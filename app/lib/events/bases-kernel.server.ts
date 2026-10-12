import { and, eq, ne, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { choreographies, modalities, submodalities } from "@/db/schema";
import { notWithdrawnChoreography } from "@/lib/choreographies/withdrawn-choreography";

/**
 * What every `Bases del evento` resource shares, and nothing else: the result
 * contracts, the failure shape and its constructors, the entity-kind
 * vocabulary, the name rules, the rejection copy, the connection types a
 * bases query runs on and the choreography guards. A resource's own inputs,
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

export type EventBasesTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

/**
 * Either connection a bases query can run on: the pool for the reads that
 * stand alone, the open transaction for the ones whose answer has to be that
 * transaction's.
 */
export type EventBasesExecutor = EventBasesTransaction | typeof db;

export type EventBaseFailure = {
  ok: false;
  code:
    | "event-bases-has-dependencies"
    | "event-bases-not-found"
    | "duplicate-name"
    | "duplicate-category-identity"
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

/**
 * The codes that report a collision with another base of the same event. Each
 * names what collided: only a name collision is `duplicate-name`.
 */
export type EventBaseCollisionCode = Extract<
  EventBaseFailure["code"],
  `duplicate-${string}`
>;

export type EventBasesMutationResult<TRecord> =
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

/**
 * A submission refused because it collides with a base the event already has,
 * under the code that names the collision.
 */
export function eventBaseCollision(
  code: EventBaseCollisionCode,
  error: string,
  fieldErrors: Record<string, string> = {},
): EventBaseFailure {
  return { ok: false, code, error, fieldErrors };
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
    return eventBaseCollision(
      "duplicate-name",
      eventBaseCopy[input.kind].duplicateError,
      { name: eventBaseCopy[input.kind].duplicateFieldError },
    );
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

export function uniqueValues(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

/**
 * Whether a choreography matching `filter` still occupies the base the caller
 * is about to edit. Every `Bases del evento` guard asks this one question, so
 * the rule that answers it lives here only.
 *
 * A choreography occupies its bases while it is not withdrawn — the same single
 * rule the schedule occupancy counts apply. A withdrawn choreography preserves
 * evidence rather than a path: it will not be performed, so it holds nothing
 * still and does not block editing the bases it points at.
 */
export async function hasOccupyingChoreographies(
  filter: SQL | undefined,
  executor: EventBasesExecutor = db,
) {
  const [choreography] = await executor
    .select({ id: choreographies.id })
    .from(choreographies)
    .where(and(filter, notWithdrawnChoreography()))
    .limit(1);

  return Boolean(choreography);
}

/**
 * Whether any choreography at all matches `filter`, occupying or not. The
 * delete guards ask this instead of `hasOccupyingChoreographies`: none of these
 * foreign keys carries an `on delete` behaviour, so the database refuses to
 * drop a base under a choreography whose inscriptions were all withdrawn too.
 * Reporting that refusal as a typed failure is what the guard adds — asking the
 * narrower question would let the raw driver error through.
 *
 * The category guards ask it for their edits as well: a withdrawn inscription
 * preserves the category and the registration path the choreography competed
 * on, so neither may move underneath it.
 */
export async function hasReferencingChoreographies(filter: SQL | undefined) {
  const [choreography] = await db
    .select({ id: choreographies.id })
    .from(choreographies)
    .where(filter)
    .limit(1);

  return Boolean(choreography);
}

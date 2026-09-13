import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";

import { db } from "@/db";
import { seminarInscriptions, seminarPrices, seminars } from "@/db/schema";
import type {
  EventBaseFailure,
  EventBasesDeleteResult,
  EventBasesMutationResult,
} from "@/lib/events/bases-repository/shared.server";
import { hasNeverExpiringPrice } from "@/lib/events/never-expiring-price";
import {
  frozenSeminarPriceDeleteError,
  frozenSeminarPriceUpdateError,
  uncoveredSeminarPriceDeleteError,
  uncoveredSeminarPriceUpdateError,
} from "@/lib/seminar-prices/guard-messages";
import { hasCompleteSeminarPriceCells } from "@/lib/seminar-prices/participant-cells";
import { activeSeminarInscription } from "@/lib/seminars/active-inscription";
import { isSeminarKind, type SeminarKind } from "@/lib/seminars/seminar-kinds";

export type SeminarPriceRow = typeof seminarPrices.$inferSelect;

export type SeminarPriceInput = {
  name?: string;
  kind: string;
  forParticipants: boolean;
  paymentDeadline: string | null;
  amount: number;
};

type ValidSeminarPriceInput = {
  name: string;
  kind: SeminarKind;
  forParticipants: boolean;
  paymentDeadline: string | null;
  amount: number;
};

/**
 * A row plus what the guards below would answer about it, so the form can lock
 * a field on sight instead of refusing after the save. The server refuses all
 * the same, for the race.
 */
export type SeminarPriceListItem = SeminarPriceRow & {
  /** Some inscription stores this row, so it is frozen except for its name. */
  isReferenced: boolean;
  /** It is the tail that keeps the event's seminars open (see the guard). */
  keepsRegistrationOpen: boolean;
};

export type SeminarPriceDependencies = {
  hasDependencies?: (seminarPriceId: string) => Promise<boolean> | boolean;
};

export async function listSeminarPrices(
  eventId: string,
): Promise<SeminarPriceListItem[]> {
  const rows = await db.query.seminarPrices.findMany({
    where: eq(seminarPrices.eventId, eventId),
    orderBy: [
      asc(seminarPrices.kind),
      asc(seminarPrices.paymentDeadline),
      asc(seminarPrices.amount),
    ],
  });

  if (rows.length === 0) {
    return [];
  }

  const [referencedIds, eventHasInscriptions] = await Promise.all([
    findReferencedSeminarPriceIds(rows.map((row) => row.id)),
    hasActiveSeminarInscriptions(eventId),
  ]);

  return rows.map((row) => ({
    ...row,
    isReferenced: referencedIds.has(row.id),
    keepsRegistrationOpen:
      eventHasInscriptions &&
      row.kind === "regular" &&
      row.paymentDeadline === null,
  }));
}

/**
 * Whether the event can be registered into at all: every participant cell of
 * the fallback tier has its deadline-less row. A seminar of an event that
 * fails this closes its portal registration, because an inscription of the
 * uncovered cell would resolve to no price.
 */
export async function hasSeminarRegistrationPrices(eventId: string) {
  const rows = await db
    .select({
      kind: seminarPrices.kind,
      forParticipants: seminarPrices.forParticipants,
      paymentDeadline: seminarPrices.paymentDeadline,
    })
    .from(seminarPrices)
    .where(eq(seminarPrices.eventId, eventId));

  return hasCompleteSeminarPriceCells(rows);
}

export async function createSeminarPrice(
  eventId: string,
  input: SeminarPriceInput,
): Promise<EventBasesMutationResult> {
  const validation = await validateSeminarPriceInput(eventId, input);

  if (!validation.ok) {
    return validation;
  }

  const [record] = await db
    .insert(seminarPrices)
    .values({ eventId, ...validation.input })
    .returning();

  return createdSeminarPrice(record);
}

export async function updateSeminarPrice(
  seminarPriceId: string,
  input: SeminarPriceInput,
  dependencies: SeminarPriceDependencies = {},
): Promise<EventBasesMutationResult> {
  const existing = await db.query.seminarPrices.findFirst({
    where: eq(seminarPrices.id, seminarPriceId),
  });

  if (!existing) {
    return seminarPriceNotFound();
  }

  const validation = await validateSeminarPriceInput(existing.eventId, input, {
    exceptId: seminarPriceId,
  });

  if (!validation.ok) {
    return validation;
  }

  const hasDependencies =
    dependencies.hasDependencies ?? seminarPriceHasOperationalDependencies;

  if (hasStructuralSeminarPriceChanges(existing, validation.input)) {
    if (await hasDependencies(seminarPriceId)) {
      return {
        ok: false,
        code: "event-bases-has-dependencies",
        error: frozenSeminarPriceUpdateError,
      };
    }

    if (await removesNeverExpiringCoverage(existing, validation.input)) {
      return {
        ok: false,
        code: "event-bases-has-dependencies",
        error: uncoveredSeminarPriceUpdateError(existing.forParticipants),
      };
    }
  }

  const [record] = await db
    .update(seminarPrices)
    .set(validation.input)
    .where(eq(seminarPrices.id, seminarPriceId))
    .returning();

  return createdSeminarPrice(record);
}

export async function deleteSeminarPrice(
  seminarPriceId: string,
  dependencies: SeminarPriceDependencies = {},
): Promise<EventBasesDeleteResult> {
  const existing = await db.query.seminarPrices.findFirst({
    where: eq(seminarPrices.id, seminarPriceId),
  });

  if (!existing) {
    return seminarPriceNotFound();
  }

  const hasDependencies =
    dependencies.hasDependencies ?? seminarPriceHasOperationalDependencies;

  if (await hasDependencies(seminarPriceId)) {
    return {
      ok: false,
      code: "event-bases-has-dependencies",
      error: frozenSeminarPriceDeleteError,
    };
  }

  if (await removesNeverExpiringCoverage(existing, null)) {
    return {
      ok: false,
      code: "event-bases-has-dependencies",
      error: uncoveredSeminarPriceDeleteError(existing.forParticipants),
    };
  }

  await db.delete(seminarPrices).where(eq(seminarPrices.id, seminarPriceId));

  return { ok: true };
}

/**
 * A row is referenced by every inscription that stored it, **withdrawn rows
 * included**: a withdrawn inscription keeps exposing the deposit figure it was
 * charged, so the row it points at cannot move either.
 */
async function seminarPriceHasOperationalDependencies(seminarPriceId: string) {
  const [dependency] = await db
    .select({ id: seminarInscriptions.id })
    .from(seminarInscriptions)
    .where(eq(seminarInscriptions.selectedPriceId, seminarPriceId))
    .limit(1);

  return Boolean(dependency);
}

async function findReferencedSeminarPriceIds(seminarPriceIds: string[]) {
  const rows = await db
    .selectDistinct({ selectedPriceId: seminarInscriptions.selectedPriceId })
    .from(seminarInscriptions)
    .where(inArray(seminarInscriptions.selectedPriceId, seminarPriceIds));

  return new Set(
    rows
      .map((row) => row.selectedPriceId)
      .filter((id): id is string => id !== null),
  );
}

/**
 * The write side of the readiness demand, re-keyed from the choreography guard:
 * a reachable participant cell must keep a row with no deadline in the
 * `regular` tier. Resolution falls through to that tier whenever the seminar's
 * own kind yields nothing, so a cell resolves as long as its tail is there, and
 * only the `regular` tier can break coverage. The question is asked
 * pre-mutation and is deliberately not date-relative.
 */
async function removesNeverExpiringCoverage(
  existing: SeminarPriceRow,
  // What the row becomes, or `null` when it is being deleted.
  next: ValidSeminarPriceInput | null,
) {
  if (existing.kind !== "regular" || existing.paymentDeadline !== null) {
    return false;
  }

  const staysTheCellTail =
    next !== null &&
    next.kind === "regular" &&
    next.forParticipants === existing.forParticipants &&
    next.paymentDeadline === null;

  if (staysTheCellTail) {
    return false;
  }

  const remainingCellPrices = await db
    .select({ paymentDeadline: seminarPrices.paymentDeadline })
    .from(seminarPrices)
    .where(
      and(
        eq(seminarPrices.eventId, existing.eventId),
        eq(seminarPrices.kind, "regular"),
        eq(seminarPrices.forParticipants, existing.forParticipants),
        ne(seminarPrices.id, existing.id),
      ),
    );

  if (hasNeverExpiringPrice(remainingCellPrices)) {
    return false;
  }

  return hasActiveSeminarInscriptions(existing.eventId);
}

/**
 * Whether the event carries a seminar inscription that is still on a roster.
 * Withdrawn rows are out, exactly as the choreography twin leaves out a
 * withdrawn `choreographyDancer`: the coverage this guard protects is the one a
 * future price resolution needs, and a withdrawn row resolves nothing until it
 * is revived — at which point it is a registration and the guard sees it again.
 */
async function hasActiveSeminarInscriptions(eventId: string) {
  const [inscription] = await db
    .select({ id: seminarInscriptions.id })
    .from(seminarInscriptions)
    .innerJoin(seminars, eq(seminars.id, seminarInscriptions.seminarId))
    .where(and(eq(seminars.eventId, eventId), activeSeminarInscription()))
    .limit(1);

  return Boolean(inscription);
}

async function validateSeminarPriceInput(
  eventId: string,
  input: SeminarPriceInput,
  options: { exceptId?: string } = {},
): Promise<{ ok: true; input: ValidSeminarPriceInput } | EventBaseFailure> {
  const parsedInput = parseSeminarPriceInput(input);

  if (!parsedInput.ok) {
    return invalidSeminarPriceInput(parsedInput.fieldErrors);
  }

  if (
    await findDuplicateSeminarPrice(
      eventId,
      parsedInput.input,
      options.exceptId,
    )
  ) {
    return duplicateSeminarPriceInput();
  }

  return { ok: true, input: parsedInput.input };
}

function parseSeminarPriceInput(input: SeminarPriceInput):
  | { ok: true; input: ValidSeminarPriceInput }
  | {
      ok: false;
      fieldErrors: Record<string, string>;
    } {
  const fieldErrors: Record<string, string> = {};
  const name = input.name?.trim() ?? "";
  const paymentDeadline = readSeminarPricePaymentDeadline(
    input.paymentDeadline,
    fieldErrors,
  );
  const kind = readSeminarKind(input.kind, fieldErrors);

  if (name.length === 0) {
    fieldErrors.name = "Ingresá el nombre del precio.";
  }

  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    fieldErrors.amount = "Ingresá un monto mayor a cero.";
  }

  if (Object.keys(fieldErrors).length > 0 || !kind) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    input: {
      name,
      kind,
      forParticipants: input.forParticipants,
      amount: input.amount,
      paymentDeadline,
    },
  };
}

// An absent deadline makes the row open-ended, it is not a missing field: the
// form gates that with its own switch, and the repository only rejects a
// malformed date.
function readSeminarPricePaymentDeadline(
  paymentDeadline: string | null,
  fieldErrors: Record<string, string>,
) {
  const trimmed = paymentDeadline?.trim() || null;

  if (trimmed !== null && !/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    fieldErrors.paymentDeadline = "Elegí una fecha válida.";
    return null;
  }

  return trimmed;
}

function readSeminarKind(kind: string, fieldErrors: Record<string, string>) {
  if (kind.trim().length === 0) {
    fieldErrors.kind = "Este campo es obligatorio.";
    return null;
  }

  if (!isSeminarKind(kind)) {
    fieldErrors.kind = "Elegí un tipo de seminario.";
    return null;
  }

  return kind;
}

async function findDuplicateSeminarPrice(
  eventId: string,
  input: ValidSeminarPriceInput,
  exceptId?: string,
) {
  const deadlineFilter = input.paymentDeadline
    ? eq(seminarPrices.paymentDeadline, input.paymentDeadline)
    : isNull(seminarPrices.paymentDeadline);

  return db
    .select({ id: seminarPrices.id })
    .from(seminarPrices)
    .where(
      and(
        eq(seminarPrices.eventId, eventId),
        eq(seminarPrices.kind, input.kind),
        eq(seminarPrices.forParticipants, input.forParticipants),
        deadlineFilter,
        exceptId ? ne(seminarPrices.id, exceptId) : undefined,
      ),
    )
    .limit(1)
    .then(([record]) => record);
}

function hasStructuralSeminarPriceChanges(
  existing: SeminarPriceRow,
  input: ValidSeminarPriceInput,
) {
  return (
    existing.kind !== input.kind ||
    existing.forParticipants !== input.forParticipants ||
    existing.amount !== input.amount ||
    existing.paymentDeadline !== input.paymentDeadline
  );
}

function invalidSeminarPriceInput(
  fieldErrors: Record<string, string>,
): EventBaseFailure {
  return {
    ok: false,
    code: "invalid-event-bases",
    error: "Revisá los datos del precio de seminario.",
    fieldErrors,
  };
}

function duplicateSeminarPriceInput(): EventBaseFailure {
  return {
    ok: false,
    code: "duplicate-name",
    error:
      "Ya existe un precio de seminario para ese tipo, esas personas y esa fecha límite.",
    fieldErrors: {
      kind: "Revisá el tipo de seminario del precio.",
    },
  };
}

function seminarPriceNotFound(): EventBaseFailure {
  return {
    ok: false,
    code: "event-bases-not-found",
    error: "No encontramos ese precio de seminario.",
  };
}

function createdSeminarPrice(
  record: SeminarPriceRow | undefined,
): EventBasesMutationResult {
  if (!record) {
    return {
      ok: false,
      code: "invalid-event-bases",
      error: "No se pudo guardar el precio de seminario.",
    };
  }

  return { ok: true, record };
}

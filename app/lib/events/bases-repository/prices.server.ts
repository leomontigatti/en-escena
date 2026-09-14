import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";

import { choreographies, choreographyDancers } from "@/db/schema";
import { hasNeverExpiringPrice } from "@/lib/events/never-expiring-price";
import {
  frozenPriceDeleteError,
  frozenPriceUpdateError,
  uncoveredPriceDeleteError,
  uncoveredPriceUpdateError,
} from "@/lib/prices/guard-messages";
import {
  created,
  db,
  groupTypeOrder,
  isGroupType,
  normalizeNullableName,
  priceDefaultNames,
  priceNotFound,
  prices,
  schedules,
  uniqueValues,
} from "@/lib/events/bases-repository/shared.server";
import type { GroupType } from "@/lib/events/group-types";
import type {
  EventBaseFailure,
  EventBasesDeleteResult,
  EventBasesMutationResult,
  PriceDependencies,
  PriceInput,
  PriceListItem,
  ValidPriceInput,
} from "@/lib/events/bases-repository/shared.server";

export async function listPrices(eventId: string): Promise<PriceListItem[]> {
  const eventPrices = await db.query.prices.findMany({
    where: eq(prices.eventId, eventId),
  });

  if (eventPrices.length === 0) {
    return [];
  }

  const scheduleIds = uniqueValues(
    eventPrices
      .map((price) => price.scheduleId)
      .filter((id): id is string => Boolean(id)),
  );
  const eventSchedules =
    scheduleIds.length > 0
      ? await db.query.schedules.findMany({
          where: inArray(schedules.id, scheduleIds),
          orderBy: [
            asc(schedules.scheduledDate),
            asc(schedules.startTime),
            asc(schedules.name),
          ],
        })
      : [];
  const schedulesById = new Map(
    eventSchedules.map((schedule) => [schedule.id, schedule]),
  );

  const [frozenPriceIds, inscribedGroupTypes] = await Promise.all([
    findFrozenPriceIds(eventPrices.map((price) => price.id)),
    findInscribedGroupTypes(eventId),
  ]);

  const listItems = await Promise.all(
    eventPrices.map(async (price) => ({
      ...price,
      schedule: price.scheduleId
        ? (schedulesById.get(price.scheduleId) ?? null)
        : null,
      isFrozen: frozenPriceIds.has(price.id),
      keepsCoverage: await keepsNeverExpiringCoverage(
        price,
        () => otherGeneralPricesOf(price, eventPrices),
        () => inscribedGroupTypes.has(price.groupType),
      ),
    })),
  );

  return listItems.sort(comparePrices);
}

// The whole event is already in hand, so the per-row question about the rest of
// the general tier is answered without going back to the database.
function otherGeneralPricesOf(
  price: typeof prices.$inferSelect,
  eventPrices: (typeof prices.$inferSelect)[],
) {
  return eventPrices.filter(
    (candidate) =>
      candidate.id !== price.id &&
      candidate.groupType === price.groupType &&
      candidate.scheduleId === null,
  );
}

async function findFrozenPriceIds(priceIds: string[]) {
  const rows = await db
    .selectDistinct({ selectedPriceId: choreographyDancers.selectedPriceId })
    .from(choreographyDancers)
    .where(inArray(choreographyDancers.selectedPriceId, priceIds));

  return new Set(
    rows
      .map((row) => row.selectedPriceId)
      .filter((id): id is string => id !== null),
  );
}

// The group types `hasActiveInscriptions` would answer `true` for, asked once
// for the event instead of once per listed row.
async function findInscribedGroupTypes(eventId: string) {
  const rows = await db
    .selectDistinct({ groupType: choreographies.groupType })
    .from(choreographyDancers)
    .innerJoin(
      choreographies,
      eq(choreographies.id, choreographyDancers.choreographyId),
    )
    .where(
      and(
        eq(choreographies.eventId, eventId),
        isNull(choreographyDancers.withdrawnAt),
      ),
    );

  return new Set(rows.map((row) => row.groupType));
}

export async function createPrice(
  eventId: string,
  input: PriceInput,
): Promise<EventBasesMutationResult> {
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
): Promise<EventBasesMutationResult> {
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

  if (hasStructuralPriceChanges(existing, validation.input)) {
    if (await hasDependencies(priceId)) {
      return {
        ok: false,
        code: "event-bases-has-dependencies",
        error: frozenPriceUpdateError,
      };
    }

    if (await removesNeverExpiringCoverage(existing, validation.input)) {
      return {
        ok: false,
        code: "event-bases-has-dependencies",
        error: uncoveredPriceUpdateError,
      };
    }
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
): Promise<EventBasesDeleteResult> {
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
      code: "event-bases-has-dependencies",
      error: frozenPriceDeleteError,
    };
  }

  if (await removesNeverExpiringCoverage(price, null)) {
    return {
      ok: false,
      code: "event-bases-has-dependencies",
      error: uncoveredPriceDeleteError,
    };
  }

  await db.delete(prices).where(eq(prices.id, priceId));

  return { ok: true };
}

// `selectedPriceId` is only written when an inscription crosses its deposit, so
// this sees frozen inscriptions and nothing else. Every un-crossed inscription
// derives its price on read, and `removesNeverExpiringCoverage` is what answers
// for those.
async function priceHasOperationalDependencies(priceId: string) {
  const [dependency] = await db
    .select({
      id: choreographyDancers.id,
    })
    .from(choreographyDancers)
    .where(eq(choreographyDancers.selectedPriceId, priceId))
    .limit(1);

  return Boolean(dependency);
}

// The write-side of readiness' demand: a reachable group type must keep a row
// with no deadline in its general tier. Two-tier resolution falls through to
// the general tier whenever the schedule tier yields nothing, so a path
// resolves as long as that row is there, and only the general tier can break
// coverage. The question is asked pre-mutation and is deliberately not
// date-relative: leaving a dated row applicable today while removing the tail
// is the silent expiry this guards against.
async function removesNeverExpiringCoverage(
  existing: typeof prices.$inferSelect,
  // What the row becomes, or `null` when it is being deleted.
  next: ValidPriceInput | null,
) {
  const staysTheGeneralTail =
    next !== null &&
    next.scheduleId === null &&
    next.groupType === existing.groupType &&
    next.paymentDeadline === null;

  if (staysTheGeneralTail) {
    return false;
  }

  return keepsNeverExpiringCoverage(
    existing,
    () => readRemainingGeneralPrices(existing),
    () => hasActiveInscriptions(existing.eventId, existing.groupType),
  );
}

/**
 * Whether the row is the one thing keeping its group type's general tier
 * resolvable: the tier's tail, with no other deadline-less row behind it, on a
 * group type that carries active inscriptions. `listPrices` asks it of every
 * row so the form can lock what would be refused, and
 * `removesNeverExpiringCoverage` asks it of the row about to move, so the flag
 * and the refusal cannot drift. Both sources are read lazily, in the order
 * that lets the cheapest answer stop first.
 */
async function keepsNeverExpiringCoverage(
  price: Pick<typeof prices.$inferSelect, "paymentDeadline" | "scheduleId">,
  readOtherGeneralPrices: () =>
    | Promise<{ paymentDeadline: string | null }[]>
    | { paymentDeadline: string | null }[],
  readActiveInscriptions: () => Promise<boolean> | boolean,
) {
  if (price.scheduleId !== null || price.paymentDeadline !== null) {
    return false;
  }

  if (hasNeverExpiringPrice(await readOtherGeneralPrices())) {
    return false;
  }

  return readActiveInscriptions();
}

function readRemainingGeneralPrices(existing: typeof prices.$inferSelect) {
  return db
    .select({ paymentDeadline: prices.paymentDeadline })
    .from(prices)
    .where(
      and(
        eq(prices.eventId, existing.eventId),
        eq(prices.groupType, existing.groupType),
        isNull(prices.scheduleId),
        ne(prices.id, existing.id),
      ),
    );
}

async function hasActiveInscriptions(eventId: string, groupType: GroupType) {
  const [inscription] = await db
    .select({ id: choreographyDancers.id })
    .from(choreographyDancers)
    .innerJoin(
      choreographies,
      eq(choreographies.id, choreographyDancers.choreographyId),
    )
    .where(
      and(
        eq(choreographies.eventId, eventId),
        eq(choreographies.groupType, groupType),
        isNull(choreographyDancers.withdrawnAt),
      ),
    )
    .limit(1);

  return Boolean(inscription);
}

async function validatePriceInput(
  eventId: string,
  input: PriceInput,
  options: { exceptId?: string } = {},
): Promise<{ ok: true; input: ValidPriceInput } | EventBaseFailure> {
  const parsedInput = parsePriceInput(input);

  if (!parsedInput.ok) {
    return invalidPriceInput(parsedInput.fieldErrors);
  }

  const scheduleError = await validatePriceSchedule(
    eventId,
    parsedInput.input.scheduleId,
  );

  if (scheduleError) {
    return invalidPriceInput({ scheduleId: scheduleError });
  }

  if (await findDuplicatePrice(eventId, parsedInput.input, options.exceptId)) {
    return duplicatePriceInput(parsedInput.input.scheduleId);
  }

  return { ok: true, input: parsedInput.input };
}

function parsePriceInput(input: PriceInput):
  | { ok: true; input: ValidPriceInput }
  | {
      ok: false;
      fieldErrors: Record<string, string>;
    } {
  const fieldErrors: Record<string, string> = {};
  const name = normalizeNullableName(input.name ?? "");
  const paymentDeadline = readPricePaymentDeadline(
    input.paymentDeadline,
    fieldErrors,
  );
  const scheduleId = input.scheduleId?.trim() || null;
  const groupType = readPriceGroupType(input.groupType, fieldErrors);

  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    fieldErrors.amount = "Ingresá un monto mayor a cero.";
  }

  if (Object.keys(fieldErrors).length > 0 || !groupType) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    input: {
      name: name ?? priceDefaultNames[groupType],
      groupType,
      amount: input.amount,
      paymentDeadline,
      scheduleId,
    },
  };
}

// An absent deadline makes the row open-ended, it is not a missing field: a
// blank `Fecha límite de pago` is how the form says so, and the repository only
// rejects a malformed date.
function readPricePaymentDeadline(
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

function readPriceGroupType(
  groupType: string,
  fieldErrors: Record<string, string>,
) {
  if (groupType.trim().length === 0) {
    fieldErrors.groupType = "Este campo es obligatorio.";
    return null;
  }

  if (!isGroupType(groupType)) {
    fieldErrors.groupType = "Elegí un tipo de grupo.";
    return null;
  }

  return groupType;
}

async function validatePriceSchedule(
  eventId: string,
  scheduleId: string | null,
) {
  if (!scheduleId) {
    return null;
  }

  const schedule = await db.query.schedules.findFirst({
    columns: { id: true },
    where: and(eq(schedules.id, scheduleId), eq(schedules.eventId, eventId)),
  });

  return schedule ? null : "Elegí un cronograma del evento activo.";
}

function invalidPriceInput(
  fieldErrors: Record<string, string>,
): EventBaseFailure {
  const onlyScheduleError =
    Object.keys(fieldErrors).length === 1 && fieldErrors.scheduleId;

  return {
    ok: false,
    code: "invalid-event-bases",
    error: onlyScheduleError
      ? "Elegí un cronograma del evento activo."
      : "Revisá los datos del precio.",
    fieldErrors,
  };
}

function duplicatePriceInput(scheduleId: string | null): EventBaseFailure {
  return {
    ok: false,
    code: "duplicate-name",
    error: scheduleId
      ? "Ya existe un precio para ese tipo de grupo y cronograma."
      : "Ya existe un precio general para ese tipo de grupo.",
    fieldErrors: {
      groupType: "Revisá el tipo de grupo del precio.",
    },
  };
}

async function findDuplicatePrice(
  eventId: string,
  input: ValidPriceInput,
  exceptId?: string,
) {
  const idFilter = exceptId ? ne(prices.id, exceptId) : undefined;
  const scheduleFilter = input.scheduleId
    ? eq(prices.scheduleId, input.scheduleId)
    : isNull(prices.scheduleId);
  const deadlineFilter = input.paymentDeadline
    ? eq(prices.paymentDeadline, input.paymentDeadline)
    : isNull(prices.paymentDeadline);

  return db
    .select({ id: prices.id })
    .from(prices)
    .where(
      and(
        eq(prices.eventId, eventId),
        eq(prices.groupType, input.groupType),
        deadlineFilter,
        scheduleFilter,
        idFilter,
      ),
    )
    .limit(1)
    .then(([record]) => record);
}

function hasStructuralPriceChanges(
  existing: typeof prices.$inferSelect,
  input: ValidPriceInput,
) {
  return (
    existing.groupType !== input.groupType ||
    existing.amount !== input.amount ||
    existing.paymentDeadline !== input.paymentDeadline ||
    existing.scheduleId !== input.scheduleId
  );
}

function comparePrices(first: PriceListItem, second: PriceListItem) {
  const groupTypeComparison =
    groupTypeOrder.indexOf(first.groupType) -
    groupTypeOrder.indexOf(second.groupType);

  if (groupTypeComparison !== 0) {
    return groupTypeComparison;
  }

  if (first.schedule && !second.schedule) {
    return -1;
  }

  if (!first.schedule && second.schedule) {
    return 1;
  }

  const firstScheduleKey = first.schedule
    ? `${first.schedule.scheduledDate}\0${first.schedule.startTime}\0${first.schedule.name}`
    : "";
  const secondScheduleKey = second.schedule
    ? `${second.schedule.scheduledDate}\0${second.schedule.startTime}\0${second.schedule.name}`
    : "";
  const scheduleComparison = firstScheduleKey.localeCompare(secondScheduleKey);

  if (scheduleComparison !== 0) {
    return scheduleComparison;
  }

  return first.amount - second.amount;
}

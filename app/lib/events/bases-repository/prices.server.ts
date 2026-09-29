import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";

import {
  choreographies,
  choreographyDancers,
  priceSchedules,
} from "@/db/schema";
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
import {
  frozenPriceDeleteError,
  frozenPriceUpdateError,
  frozenSpecialPriceUpdateError,
  uncoveredPriceDeleteError,
  uncoveredPriceUpdateError,
} from "@/lib/prices/guards";
import {
  listOccupiedDroppedSchedules,
  replacePriceSchedules,
} from "@/lib/events/bases-repository/price-schedules.server";
import {
  loadEventPriceRows,
  loadPriceRow,
  type PriceRow,
} from "@/lib/prices/rows.server";

// The uncovered guard tests two things — that this is the group type's only row
// with no deadline, and that the group type carries active inscriptions — but
// not that those inscriptions read this row. A group type whose inscriptions
// have all frozen onto another row is still refused, and correctly so: the
// roster admin path skips the readiness gate, so nothing else would stop a later
// un-frozen inscription from landing on an uncovered path.
export async function listPrices(eventId: string): Promise<PriceListItem[]> {
  const eventPrices = await loadEventPriceRows(db, eventId);

  if (eventPrices.length === 0) {
    return [];
  }

  // What the guards below would answer about each row, so the form can lock a
  // field on sight instead of refusing after the save.
  const [referencedIds, groupTypesWithInscriptions] = await Promise.all([
    findReferencedPriceIds(eventPrices.map((price) => price.id)),
    findGroupTypesWithActiveInscriptions(eventId),
  ]);

  const scheduleIds = uniqueValues(
    eventPrices.flatMap((price) => price.scheduleIds),
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
  return eventPrices
    .map((price) => ({
      ...price,
      isReferenced: referencedIds.has(price.id),
      keepsRegistrationOpen:
        isGeneralTail(price) && groupTypesWithInscriptions.has(price.groupType),
      schedules: eventSchedules.filter((schedule) =>
        price.scheduleIds.includes(schedule.id),
      ),
    }))
    .sort(comparePrices);
}

export async function createPrice(
  eventId: string,
  input: PriceInput,
): Promise<EventBasesMutationResult> {
  const validation = await validatePriceInput(eventId, input);

  if (!validation.ok) {
    return validation;
  }

  const record = await db.transaction(async (tx) => {
    const { scheduleIds, ...values } = validation.input;
    const [inserted] = await tx
      .insert(prices)
      .values({
        eventId,
        ...values,
        isSpecialPrice: scheduleIds.length > 0,
      })
      .returning();

    await replacePriceSchedules(tx, inserted, scheduleIds);

    return inserted;
  });

  return created(record);
}

export async function updatePrice(
  priceId: string,
  input: PriceInput,
  dependencies: PriceDependencies = {},
): Promise<EventBasesMutationResult> {
  const existing = await loadPriceRow(db, priceId);

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
        error: existing.isSpecialPrice
          ? frozenSpecialPriceUpdateError
          : frozenPriceUpdateError,
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

  const occupiedScheduleNames = await listOccupiedDroppedSchedules(
    db,
    existing,
    validation.input.scheduleIds,
  );

  if (occupiedScheduleNames.length > 0) {
    return {
      ok: false,
      code: "event-bases-has-dependencies",
      error: `No se pueden quitar cronogramas con inscripciones que usan este precio: ${occupiedScheduleNames.join(", ")}.`,
      fieldErrors: { scheduleIds: "Revisá los cronogramas del precio." },
    };
  }

  const record = await db.transaction(async (tx) => {
    const { scheduleIds, ...values } = validation.input;
    const [updated] = await tx
      .update(prices)
      .set({ ...values, isSpecialPrice: scheduleIds.length > 0 })
      .where(eq(prices.id, priceId))
      .returning();

    await replacePriceSchedules(tx, updated, scheduleIds);

    return updated;
  });

  return created(record);
}

export async function deletePrice(
  priceId: string,
  dependencies: PriceDependencies = {},
): Promise<EventBasesDeleteResult> {
  const price = await loadPriceRow(db, priceId);

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

  // The links go with it: `price_schedule_price_fk` cascades.
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

async function findReferencedPriceIds(priceIds: string[]) {
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

// The list-side twin of `hasActiveInscriptions`: every group type of the event
// that carries a non-withdrawn inscription, in one query.
async function findGroupTypesWithActiveInscriptions(eventId: string) {
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

// The write-side of readiness' demand: a reachable group type must keep a row
// with no deadline in its general tier. Two-tier resolution falls through to
// the general tier whenever the schedule tier yields nothing, so a path
// resolves as long as that row is there, and only the general tier can break
// coverage. The question is asked pre-mutation and is deliberately not
// date-relative: leaving a dated row applicable today while removing the tail
// is the silent expiry this guards against.
async function removesNeverExpiringCoverage(
  existing: PriceRow,
  // What the row becomes, or `null` when it is being deleted.
  next: ValidPriceInput | null,
) {
  if (!isGeneralTail(existing)) {
    return false;
  }

  const staysTheGeneralTail =
    next !== null &&
    next.scheduleIds.length === 0 &&
    next.groupType === existing.groupType &&
    next.paymentDeadline === null;

  if (staysTheGeneralTail) {
    return false;
  }

  return hasActiveInscriptions(existing.eventId, existing.groupType);
}

/**
 * Whether the row is its group type's deadline-less general row. It is the
 * only one: `price_general_unique` is `NULLS NOT DISTINCT` on
 * `(event_id, group_type, payment_deadline)` over the general rows, so no other
 * row can stand in for it. `listPrices` and `removesNeverExpiringCoverage` both ask it, so the flag
 * the form locks on and the refusal cannot drift.
 */
function isGeneralTail(
  price: Pick<PriceRow, "paymentDeadline" | "scheduleIds">,
) {
  return price.scheduleIds.length === 0 && price.paymentDeadline === null;
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

  const scheduleError = await validatePriceSchedules(
    eventId,
    parsedInput.input.scheduleIds,
  );

  if (scheduleError) {
    return invalidPriceInput({ scheduleIds: scheduleError });
  }

  const duplicate = await findDuplicatePrice(
    eventId,
    parsedInput.input,
    options.exceptId,
  );

  if (duplicate) {
    return duplicatePriceInput(duplicate);
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
  const scheduleIds = uniqueValues(
    input.scheduleIds.map((id) => id.trim()).filter(Boolean),
  ).sort();
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
      scheduleIds,
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

async function validatePriceSchedules(
  eventId: string,
  scheduleIds: readonly string[],
) {
  if (scheduleIds.length === 0) {
    return null;
  }

  const eventSchedules = await db
    .select({ id: schedules.id })
    .from(schedules)
    .where(
      and(
        inArray(schedules.id, [...scheduleIds]),
        eq(schedules.eventId, eventId),
      ),
    );

  return eventSchedules.length === scheduleIds.length
    ? null
    : "Elegí cronogramas del evento activo.";
}

function invalidPriceInput(
  fieldErrors: Record<string, string>,
): EventBaseFailure {
  const onlyScheduleError =
    Object.keys(fieldErrors).length === 1 && fieldErrors.scheduleIds;

  return {
    ok: false,
    code: "invalid-event-bases",
    error: onlyScheduleError
      ? "Elegí cronogramas del evento activo."
      : "Revisá los datos del precio.",
    fieldErrors,
  };
}

/**
 * What a new or edited price collides with: the general row of its group type
 * and deadline, or — for a special price — the schedules already covered by
 * another special row of that group type and deadline.
 */
type PriceDuplicate =
  { tier: "general" } | { tier: "special"; scheduleNames: string[] };

function duplicatePriceInput(duplicate: PriceDuplicate): EventBaseFailure {
  if (duplicate.tier === "general") {
    return {
      ok: false,
      code: "duplicate-name",
      error: "Ya existe un precio general para ese tipo de grupo.",
      fieldErrors: {
        groupType: "Revisá el tipo de grupo del precio.",
      },
    };
  }

  return {
    ok: false,
    code: "duplicate-name",
    error: `Ya existe un precio especial para ese tipo de grupo y fecha límite en ${formatScheduleNames(duplicate.scheduleNames)}.`,
    fieldErrors: {
      scheduleIds: "Revisá los cronogramas del precio.",
    },
  };
}

function formatScheduleNames(names: string[]) {
  return new Intl.ListFormat("es-AR", {
    style: "long",
    type: "conjunction",
  }).format(names);
}

async function findDuplicatePrice(
  eventId: string,
  input: ValidPriceInput,
  exceptId?: string,
): Promise<PriceDuplicate | null> {
  if (input.scheduleIds.length === 0) {
    const [general] = await db
      .select({ id: prices.id })
      .from(prices)
      .where(
        and(
          eq(prices.eventId, eventId),
          eq(prices.groupType, input.groupType),
          eq(prices.isSpecialPrice, false),
          matchesDeadline(prices.paymentDeadline, input.paymentDeadline),
          exceptId ? ne(prices.id, exceptId) : undefined,
        ),
      )
      .limit(1);

    return general ? { tier: "general" } : null;
  }

  const colliding = await db
    .select({ name: schedules.name })
    .from(priceSchedules)
    .innerJoin(schedules, eq(schedules.id, priceSchedules.scheduleId))
    .where(
      and(
        inArray(priceSchedules.scheduleId, input.scheduleIds),
        eq(priceSchedules.groupType, input.groupType),
        matchesDeadline(priceSchedules.paymentDeadline, input.paymentDeadline),
        exceptId ? ne(priceSchedules.priceId, exceptId) : undefined,
      ),
    )
    .orderBy(asc(schedules.scheduledDate), asc(schedules.startTime));

  return colliding.length > 0
    ? { tier: "special", scheduleNames: colliding.map((row) => row.name) }
    : null;
}

function matchesDeadline(
  column: typeof prices.paymentDeadline | typeof priceSchedules.paymentDeadline,
  paymentDeadline: string | null,
) {
  return paymentDeadline ? eq(column, paymentDeadline) : isNull(column);
}

// Which schedules a special price covers is not structure: an inscription that
// stored the row keeps it wherever the row is offered, so adding a schedule
// touches no one, and dropping one is refused on its own while an inscription
// of the price sits on it (`listOccupiedDroppedSchedules`). Moving the row
// between the general and the special tier is structure.
function hasStructuralPriceChanges(existing: PriceRow, input: ValidPriceInput) {
  return (
    existing.groupType !== input.groupType ||
    existing.amount !== input.amount ||
    existing.paymentDeadline !== input.paymentDeadline ||
    existing.isSpecialPrice !== input.scheduleIds.length > 0
  );
}

function comparePrices(first: PriceListItem, second: PriceListItem) {
  const groupTypeComparison =
    groupTypeOrder.indexOf(first.groupType) -
    groupTypeOrder.indexOf(second.groupType);

  if (groupTypeComparison !== 0) {
    return groupTypeComparison;
  }

  const [firstSchedule] = first.schedules;
  const [secondSchedule] = second.schedules;

  if (firstSchedule && !secondSchedule) {
    return -1;
  }

  if (!firstSchedule && secondSchedule) {
    return 1;
  }

  const firstScheduleKey = firstSchedule
    ? `${firstSchedule.scheduledDate}\0${firstSchedule.startTime}\0${firstSchedule.name}`
    : "";
  const secondScheduleKey = secondSchedule
    ? `${secondSchedule.scheduledDate}\0${secondSchedule.startTime}\0${secondSchedule.name}`
    : "";
  const scheduleComparison = firstScheduleKey.localeCompare(secondScheduleKey);

  if (scheduleComparison !== 0) {
    return scheduleComparison;
  }

  return first.amount - second.amount;
}

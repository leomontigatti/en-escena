import { and, asc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";

import {
  academyEventChoreographyInvoices,
  academyEventInvoiceImputations,
  choreographies,
  scheduleCapacities,
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
  toDateOnly,
  uniqueValues,
} from "@/lib/events/bases-repository/shared.server";
import type {
  EventBaseFailure,
  EventBasesDeleteResult,
  EventBasesMutationResult,
  PriceDependencies,
  PriceInput,
  PriceListItem,
  PriceResolutionResult,
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

  return eventPrices
    .map((price) => ({
      ...price,
      schedule: price.scheduleId
        ? (schedulesById.get(price.scheduleId) ?? null)
        : null,
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

  if (
    (await hasDependencies(priceId)) &&
    hasStructuralPriceChanges(existing, validation.input)
  ) {
    return {
      ok: false,
      code: "event-bases-has-dependencies",
      error:
        "No se pueden editar monto, tipo de grupo, vencimiento ni cronograma porque hay facturas pagadas históricas que dependen de este precio.",
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
      error:
        "No se puede borrar el precio porque hay facturas pagadas históricas que dependen de este precio.",
    };
  }

  await db.delete(prices).where(eq(prices.id, priceId));

  return { ok: true };
}

export async function resolveApplicablePrice(input: {
  eventId: string;
  groupType: string;
  paymentDate?: Date | string | null;
  scheduleId: string | null;
}): Promise<PriceResolutionResult> {
  if (!isGroupType(input.groupType)) {
    return {
      ok: false,
      code: "invalid-group-type",
      error: "No se pudo resolver el precio para ese tipo de grupo.",
    };
  }

  if (input.scheduleId) {
    const specificPrices = await db.query.prices.findMany({
      where: and(
        eq(prices.eventId, input.eventId),
        eq(prices.groupType, input.groupType),
        eq(prices.scheduleId, input.scheduleId),
      ),
    });
    const specificPrice = selectApplicablePriceFromCandidates(
      specificPrices,
      input.paymentDate,
    );

    if (specificPrice) {
      return { ok: true, price: specificPrice };
    }
  }

  const generalPrices = await db.query.prices.findMany({
    where: and(
      eq(prices.eventId, input.eventId),
      eq(prices.groupType, input.groupType),
      isNull(prices.scheduleId),
    ),
  });
  const generalPrice = selectApplicablePriceFromCandidates(
    generalPrices,
    input.paymentDate,
  );

  if (generalPrice) {
    return { ok: true, price: generalPrice };
  }

  return {
    ok: false,
    code: "missing-price",
    error: "No hay un precio configurado para este tipo de grupo y cronograma.",
  };
}

async function priceHasOperationalDependencies(priceId: string) {
  const price = await db.query.prices.findFirst({
    columns: {
      amount: true,
      eventId: true,
      groupType: true,
      id: true,
      paymentDeadline: true,
      scheduleId: true,
    },
    where: eq(prices.id, priceId),
  });

  if (!price) {
    return false;
  }

  const [dependency] = await db
    .select({
      id: academyEventChoreographyInvoices.id,
    })
    .from(academyEventChoreographyInvoices)
    .innerJoin(
      choreographies,
      eq(academyEventChoreographyInvoices.choreographyId, choreographies.id),
    )
    .leftJoin(
      scheduleCapacities,
      eq(choreographies.scheduleCapacityId, scheduleCapacities.id),
    )
    .leftJoin(
      academyEventInvoiceImputations,
      and(
        eq(
          academyEventInvoiceImputations.invoiceId,
          academyEventChoreographyInvoices.id,
        ),
        isNull(academyEventInvoiceImputations.annulledAt),
      ),
    )
    .where(
      and(
        eq(academyEventChoreographyInvoices.eventId, price.eventId),
        isNull(academyEventChoreographyInvoices.cancelledAt),
        buildHistoricalPriceReferenceFilter(price),
      ),
    )
    .groupBy(
      academyEventChoreographyInvoices.id,
      academyEventChoreographyInvoices.depositAmount,
    )
    .having(
      sql`coalesce(sum(${academyEventInvoiceImputations.amount}), 0) >= ${academyEventChoreographyInvoices.depositAmount}`,
    )
    .limit(1);

  return Boolean(dependency);
}

function buildHistoricalPriceReferenceFilter(price: {
  amount: number;
  groupType: (typeof prices.$inferSelect)["groupType"];
  id: string;
  paymentDeadline: string | null;
  scheduleId: string | null;
}) {
  const legacyReferenceFilter = and(
    isNull(academyEventChoreographyInvoices.selectedPriceId),
    eq(choreographies.groupType, price.groupType),
    eq(academyEventChoreographyInvoices.basePriceAmount, price.amount),
    price.paymentDeadline === null
      ? isNull(academyEventChoreographyInvoices.selectedPaymentDeadline)
      : eq(
          academyEventChoreographyInvoices.selectedPaymentDeadline,
          price.paymentDeadline,
        ),
    price.scheduleId === null
      ? undefined
      : eq(scheduleCapacities.scheduleId, price.scheduleId),
  );

  return or(
    eq(academyEventChoreographyInvoices.selectedPriceId, price.id),
    legacyReferenceFilter,
  );
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
  const paymentDeadline = input.paymentDeadline.trim();
  const scheduleId = input.scheduleId?.trim() || null;
  const groupType = readPriceGroupType(input.groupType, fieldErrors);

  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    fieldErrors.amount = "Ingresá un monto mayor a cero.";
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDeadline)) {
    fieldErrors.paymentDeadline = "Este campo es obligatorio.";
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

  return db
    .select({ id: prices.id })
    .from(prices)
    .where(
      and(
        eq(prices.eventId, eventId),
        eq(prices.groupType, input.groupType),
        eq(prices.paymentDeadline, input.paymentDeadline),
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

export function selectApplicablePriceFromCandidates(
  candidates: Array<typeof prices.$inferSelect>,
  paymentDate: Date | string | null | undefined,
) {
  const dateOnly = paymentDate ? toDateOnly(paymentDate) : null;
  const applicableCandidates = dateOnly
    ? candidates.filter(
        (price) =>
          price.paymentDeadline === null || price.paymentDeadline >= dateOnly,
      )
    : candidates;

  return applicableCandidates.sort(compareApplicablePrices)[0] ?? null;
}

function compareApplicablePrices(
  first: typeof prices.$inferSelect,
  second: typeof prices.$inferSelect,
) {
  if (first.paymentDeadline === null && second.paymentDeadline !== null) {
    return 1;
  }

  if (first.paymentDeadline !== null && second.paymentDeadline === null) {
    return -1;
  }

  if (first.paymentDeadline && second.paymentDeadline) {
    const deadlineComparison = first.paymentDeadline.localeCompare(
      second.paymentDeadline,
    );

    if (deadlineComparison !== 0) {
      return deadlineComparison;
    }
  }

  return first.amount - second.amount;
}

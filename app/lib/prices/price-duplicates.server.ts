import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";

import { db } from "@/db";
import { priceSchedules, prices, schedules } from "@/db/schema";
import type { EventBaseFailure } from "@/lib/events/bases-kernel.server";
import type { GroupType } from "@/lib/events/group-types";
import { isUniqueViolation } from "@/lib/shared/error-properties.server";

/**
 * What identifies a price within its event: its group type and deadline, and
 * the schedules it covers (none for a general price). Two prices with the same
 * key collide, and `duplicate-price-group-schedule` reports the collision —
 * no name is involved.
 */
type PriceDuplicateKey = {
  groupType: GroupType;
  paymentDeadline: string | null;
  scheduleIds: string[];
};

/** The failure a save gets when its price collides with another, or `null`. */
export async function findPriceDuplicateFailure(
  eventId: string,
  input: PriceDuplicateKey,
  exceptId?: string,
): Promise<EventBaseFailure | null> {
  const duplicate = await findDuplicatePrice(eventId, input, exceptId);

  return duplicate ? duplicatePriceInput(duplicate) : null;
}

/**
 * What a new or edited price collides with: the general row of its group type
 * and deadline, or — for a special price — the schedules already covered by
 * another special row of that group type and deadline.
 */
type PriceDuplicate =
  { tier: "general" } | { tier: "special"; scheduleNames: string[] };

// The two constraints `findDuplicatePrice` answers for ahead of the write.
const priceDuplicateConstraints = [
  "price_general_unique",
  "price_schedule_tier_unique",
] as const;

/**
 * A save whose pre-check missed a colliding price that was being saved at the
 * same moment: the constraint refused it at the write. It gets the failure the
 * pre-check would have given, asked again now that the other save committed so
 * a special price still names the schedules. The constraint names the tier if
 * the other row is gone again by then.
 */
export async function refuseLostDuplicateRace(
  error: unknown,
  eventId: string,
  input: PriceDuplicateKey,
  exceptId?: string,
): Promise<EventBaseFailure> {
  const constraint = priceDuplicateConstraints.find((name) =>
    isUniqueViolation(error, name),
  );

  if (!constraint) {
    throw error;
  }

  return duplicatePriceInput(
    (await findDuplicatePrice(eventId, input, exceptId)) ??
      (constraint === "price_general_unique"
        ? { tier: "general" }
        : { tier: "special", scheduleNames: [] }),
  );
}

function duplicatePriceInput(duplicate: PriceDuplicate): EventBaseFailure {
  if (duplicate.tier === "general") {
    return {
      ok: false,
      code: "duplicate-price-group-schedule",
      error: "Ya existe un precio general para ese tipo de grupo.",
      fieldErrors: {
        groupType: "Revisá el tipo de grupo del precio.",
      },
    };
  }

  // No names only after a lost race whose winner is gone again by the re-check
  // (`refuseLostDuplicateRace`).
  const where =
    duplicate.scheduleNames.length > 0
      ? formatScheduleNames(duplicate.scheduleNames)
      : "esos cronogramas";

  return {
    ok: false,
    code: "duplicate-price-group-schedule",
    error: `Ya existe un precio especial para ese tipo de grupo y fecha límite en ${where}.`,
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
  input: PriceDuplicateKey,
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

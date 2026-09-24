import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { events, schedules } from "@/db/schema";
import type {
  EventBaseFailure,
  EventBasesMutationResult,
} from "@/lib/events/bases-repository/shared.server";
import { getEventRegistrationReadiness } from "@/lib/events/registration-readiness.server";
import {
  collectScheduleRegistrationOpenBlockers,
  scheduleRegistrationOpenRefusalMessage,
  type ScheduleRegistrationOpenBlockers,
} from "@/lib/schedules/registration-open";

export type ScheduleRegistrationOpenRefusal = EventBaseFailure & {
  code: "schedule-registration-not-allowed";
  reasons: ScheduleRegistrationOpenBlockers;
};

export type ScheduleRegistrationToggleResult =
  EventBasesMutationResult | ScheduleRegistrationOpenRefusal;

/**
 * The reasons `Abrir inscripciones` would be refused for any schedule of this
 * event, as the schedule detail reads them to disable the action and list them
 * in its alert. The server runs the very same collection before it writes, so
 * an administrator who forces the request past a stale page gets the refusal
 * anyway.
 */
export async function getEventRegistrationOpenBlockers(
  eventId: string,
): Promise<ScheduleRegistrationOpenBlockers> {
  const event = await db.query.events.findFirst({
    columns: { endsAt: true },
    where: eq(events.id, eventId),
  });

  if (!event) {
    return [];
  }

  return collectScheduleRegistrationOpenBlockers({
    endsAt: event.endsAt,
    readiness: await getEventRegistrationReadiness(eventId),
  });
}

/**
 * The `Cronograma`s of the event taking inscriptions right now, by id. The
 * portal resolver offers no other: the event-level predicate only says that
 * *some* schedule is open, and a path whose own shows are all closed has to be
 * refused even then.
 */
export async function findOpenScheduleIds(
  eventId: string,
): Promise<Set<string>> {
  const rows = await db.query.schedules.findMany({
    columns: { id: true },
    where: and(
      eq(schedules.eventId, eventId),
      eq(schedules.registrationOpen, true),
    ),
  });

  return new Set(rows.map((row) => row.id));
}

/**
 * The one implementation of "las inscripciones están abiertas" for an event:
 * open when any of its `Cronograma`s is open, closed when none is and closed
 * when the event has none at all. Nothing stores the event-level fact, so
 * display and enforcement cannot drift.
 */
export async function isEventRegistrationOpen(
  eventId: string | null,
): Promise<boolean> {
  if (!eventId) {
    return false;
  }

  // The same query the portal resolver filters its options with, so "the event
  // is open" and "this schedule is offered" can never answer from two reads.
  const openScheduleIds = await findOpenScheduleIds(eventId);

  return openScheduleIds.size > 0;
}

export async function openScheduleRegistration(
  scheduleId: string,
): Promise<ScheduleRegistrationToggleResult> {
  const schedule = await db.query.schedules.findFirst({
    where: eq(schedules.id, scheduleId),
  });

  if (!schedule) {
    return scheduleNotFound();
  }

  const reasons = await getEventRegistrationOpenBlockers(schedule.eventId);

  if (reasons.length > 0) {
    return {
      ok: false,
      code: "schedule-registration-not-allowed",
      error: scheduleRegistrationOpenRefusalMessage,
      fieldErrors: {},
      reasons,
    };
  }

  return setScheduleRegistrationOpen(scheduleId, true);
}

/** Closing is the administrator's word and nothing else's, so it never fails. */
export async function closeScheduleRegistration(
  scheduleId: string,
): Promise<ScheduleRegistrationToggleResult> {
  return setScheduleRegistrationOpen(scheduleId, false);
}

async function setScheduleRegistrationOpen(
  scheduleId: string,
  registrationOpen: boolean,
): Promise<EventBasesMutationResult> {
  const [record] = await db
    .update(schedules)
    .set({ registrationOpen })
    .where(eq(schedules.id, scheduleId))
    .returning();

  if (!record) {
    return scheduleNotFound();
  }

  return { ok: true, record };
}

function scheduleNotFound(): EventBaseFailure {
  return {
    ok: false,
    code: "event-bases-not-found",
    error: "No encontramos ese cronograma.",
    fieldErrors: {},
  };
}

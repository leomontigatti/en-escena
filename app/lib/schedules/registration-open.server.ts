import { eq } from "drizzle-orm";

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

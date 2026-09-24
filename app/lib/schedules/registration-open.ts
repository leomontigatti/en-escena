import type { EventRegistrationReadiness } from "@/lib/events/registration-readiness";

/**
 * Why `Abrir inscripciones` would be refused for a schedule of this event. The
 * action is per `Cronograma` but every reason is the event's: readiness
 * measures the `Bases del evento`, and a finished event has nothing left to
 * inscribe into. An empty list is the permission to open.
 *
 * The same list drives the menu item's disabled state and the alert that names
 * the reasons, so what the UI offers and what the server allows cannot drift.
 */
export type ScheduleRegistrationOpenBlockers = string[];

export const eventEndedRegistrationOpenBlocker = "El evento ya finalizó.";

export const scheduleRegistrationOpenRefusalMessage =
  "No se pueden abrir las inscripciones de este cronograma.";

export function collectScheduleRegistrationOpenBlockers({
  now = new Date(),
  endsAt,
  readiness,
}: {
  now?: Date;
  endsAt: Date;
  readiness: EventRegistrationReadiness;
}): ScheduleRegistrationOpenBlockers {
  const blockers = readiness.isReady
    ? []
    : readiness.missingItems.map((missingItem) => missingItem.detail);

  if (endsAt.getTime() < now.getTime()) {
    blockers.push(eventEndedRegistrationOpenBlocker);
  }

  return blockers;
}

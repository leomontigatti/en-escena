/**
 * The `Estado del evento`: where an event stands in time, derived from its
 * dates and never stored. It says nothing about whether the event is the
 * `Evento activo`; `docs/domain/events.md` keeps the two apart.
 */
export type EventStatus = "not-started" | "in-progress" | "finished";

/** Both ends of the event's dates count as `in-progress`. */
export function getEventStatus(
  event: { startsAt: Date; endsAt: Date },
  now: Date,
): EventStatus {
  if (now < event.startsAt) {
    return "not-started";
  }

  if (now > event.endsAt) {
    return "finished";
  }

  return "in-progress";
}

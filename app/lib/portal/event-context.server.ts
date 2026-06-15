import { db } from "@/db";
import { getEventRegistrationReadiness } from "@/lib/events/registration-readiness.server";
import type {
  PortalEventContext,
  PortalEventSummary,
} from "@/lib/portal/event-context";

export async function getPortalEventContext(
  _request: Request,
): Promise<PortalEventContext> {
  const events = await db.query.events.findMany({
    columns: {
      id: true,
      name: true,
      active: true,
      registrationStartsAt: true,
      registrationEndsAt: true,
      startsAt: true,
      endsAt: true,
    },
    orderBy: (table, { desc }) => [desc(table.startsAt), desc(table.createdAt)],
  });

  const activeEvent = events.find((event) => event.active) ?? null;
  const selectedEvent = activeEvent;
  const now = new Date();
  const activeEventRegistrationReadiness = activeEvent
    ? await getEventRegistrationReadiness(activeEvent.id)
    : null;

  return {
    events,
    selectedEvent,
    activeEvent,
    hasActiveEvent: activeEvent !== null,
    activeEventRegistrationReadiness,
    hasEvents: events.length > 0,
    isReadOnly: selectedEvent ? !selectedEvent.active : true,
    isRegistrationOpen: isRegistrationWindowOpen(selectedEvent, now),
  };
}

function isRegistrationWindowOpen(event: PortalEventSummary | null, now: Date) {
  if (!event) {
    return false;
  }

  return event.registrationStartsAt <= now && now <= event.registrationEndsAt;
}

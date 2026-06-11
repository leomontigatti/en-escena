import { db } from "@/db";
import { getEventRegistrationReadiness } from "@/lib/event-registration-readiness.server";
import type {
  PortalEventContext,
  PortalEventSummary,
} from "@/lib/portal-event-context";

const portalEventQueryParamName = "evento";

export async function getPortalEventContext(
  request: Request,
): Promise<PortalEventContext> {
  const selectedEventId = new URL(request.url).searchParams.get(
    portalEventQueryParamName,
  );
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

  const selectedEvent = selectPortalEvent(events, selectedEventId);
  const activeEvent = events.find((event) => event.active) ?? null;
  const now = new Date();
  const activeEventRegistrationReadiness = activeEvent
    ? await getEventRegistrationReadiness(activeEvent.id)
    : null;

  return {
    queryParamName: portalEventQueryParamName,
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

function selectPortalEvent(
  events: PortalEventSummary[],
  selectedEventId: string | null,
): PortalEventSummary | null {
  const querySelectedEvent = events.find(
    (event) => event.id === selectedEventId,
  );
  const defaultEvent = events.find((event) => event.active) ?? events.at(0);

  return querySelectedEvent ?? defaultEvent ?? null;
}

function isRegistrationWindowOpen(event: PortalEventSummary | null, now: Date) {
  if (!event) {
    return false;
  }

  return event.registrationStartsAt <= now && now <= event.registrationEndsAt;
}

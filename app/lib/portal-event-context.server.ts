import { db } from "@/db";
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
  const now = new Date();

  return {
    queryParamName: portalEventQueryParamName,
    events,
    selectedEvent,
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

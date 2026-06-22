import { db } from "@/db";
import { getEventRegistrationReadiness } from "@/lib/events/registration-readiness.server";
import type {
  PortalActiveEventContext,
  PortalEventContext,
  PortalShellEventContext,
  PortalEventSummary,
} from "@/lib/portal/event-context";

export async function getPortalShellEventContext(
  _request: Request,
): Promise<PortalShellEventContext> {
  const events = await listPortalEventSummaries();
  const activeEvent = events.find((event) => event.active) ?? null;

  return {
    activeEvent,
  };
}

export async function getPortalActiveEventContext(
  _request: Request,
): Promise<PortalActiveEventContext> {
  const events = await listPortalEventSummaries();
  const activeEvent = events.find((event) => event.active) ?? null;
  const selectedEvent = activeEvent;
  const now = new Date();

  return {
    selectedEvent,
    activeEvent,
    hasActiveEvent: activeEvent !== null,
    hasEvents: events.length > 0,
    isReadOnly: selectedEvent ? !selectedEvent.active : true,
    isRegistrationOpen: isRegistrationWindowOpen(selectedEvent, now),
  };
}

export async function getPortalActiveEventReadinessContext(
  request: Request,
): Promise<PortalEventContext> {
  const eventContext = await getPortalActiveEventContext(request);
  const activeEventRegistrationReadiness = eventContext.activeEvent
    ? await getEventRegistrationReadiness(eventContext.activeEvent.id)
    : null;

  return {
    ...eventContext,
    activeEventRegistrationReadiness,
  };
}

export const getPortalEventContext = getPortalActiveEventReadinessContext;

async function listPortalEventSummaries() {
  return db.query.events.findMany({
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
}

function isRegistrationWindowOpen(event: PortalEventSummary | null, now: Date) {
  if (!event) {
    return false;
  }

  return event.registrationStartsAt <= now && now <= event.registrationEndsAt;
}

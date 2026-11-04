import { desc } from "drizzle-orm";

import { db } from "@/db";
import { events as eventsTable } from "@/db/schema";
import { requireAdminPanelWriter } from "@/lib/auth/internal-access.server";
import { getEventStatus, type EventStatus } from "@/lib/events/event-status";
import { getEventRegistrationReadinessByEventId } from "@/lib/events/registration-readiness.server";
import type { EventsListLoaderData } from "./shared";
type EventRow = typeof eventsTable.$inferSelect;

export async function loadEvents(
  request: Request,
): Promise<EventsListLoaderData> {
  await requireAdminPanelWriter(request);
  const eventRows = await db.query.events.findMany({
    orderBy: [desc(eventsTable.startsAt)],
  });
  const now = new Date();
  const eventsWithStatus = eventRows.map((event) => {
    const eventStatus = getEventStatus(event, now);

    return {
      event,
      shouldShowRegistrationReadiness: shouldShowRegistrationReadiness(
        event,
        eventStatus,
      ),
      eventStatus,
    };
  });
  const eventReadinessById = await getEventRegistrationReadinessByEventId(
    eventsWithStatus
      .filter((eventState) => eventState.shouldShowRegistrationReadiness)
      .map(({ event }) => event.id),
  );

  return {
    events: eventsWithStatus.map(
      ({ event, shouldShowRegistrationReadiness, eventStatus }) => ({
        ...event,
        isRegistrationReady: eventReadinessById.get(event.id)?.isReady ?? false,
        shouldShowRegistrationReadiness,
        eventStatus,
      }),
    ),
  };
}

function shouldShowRegistrationReadiness(
  event: Pick<EventRow, "active">,
  eventStatus: EventStatus,
) {
  return event.active || eventStatus !== "finished";
}

import type { events as eventsTable } from "@/db/schema";
import type { EventStatus } from "@/lib/events/event-status";

type EventRow = typeof eventsTable.$inferSelect;
export type EventListRow = EventRow & {
  isRegistrationReady: boolean;
  shouldShowRegistrationReadiness: boolean;
  eventStatus: EventStatus;
};

export type EventsListLoaderData = {
  events: EventListRow[];
};

import type { events as eventsTable } from "@/db/schema";

type EventRow = typeof eventsTable.$inferSelect;
type TemporalState =
  | { label: "No iniciado"; value: "not-started" }
  | { label: "En curso"; value: "in-progress" }
  | { label: "Finalizado"; value: "finished" };

export type EventListRow = EventRow & {
  isRegistrationReady: boolean;
  shouldShowRegistrationReadiness: boolean;
  temporalState: TemporalState;
};

export type AdministrativeEventsListLoaderData = {
  events: EventListRow[];
};

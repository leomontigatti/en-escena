import type { EventRegistrationReadiness } from "@/lib/event-registration-readiness";

export type PortalEventSummary = {
  id: string;
  name: string;
  active: boolean;
  registrationStartsAt: Date;
  registrationEndsAt: Date;
  startsAt: Date;
  endsAt: Date;
};

export type PortalEventContext = {
  queryParamName: string;
  events: PortalEventSummary[];
  selectedEvent: PortalEventSummary | null;
  activeEvent: PortalEventSummary | null;
  hasActiveEvent: boolean;
  activeEventRegistrationReadiness: EventRegistrationReadiness | null;
  hasEvents: boolean;
  isReadOnly: boolean;
  isRegistrationOpen: boolean;
};

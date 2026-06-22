import type { EventRegistrationReadiness } from "@/lib/events/registration-readiness";

export type PortalEventSummary = {
  id: string;
  name: string;
  active: boolean;
  registrationStartsAt: Date;
  registrationEndsAt: Date;
  startsAt: Date;
  endsAt: Date;
};

export type PortalShellEventContext = {
  activeEvent: PortalEventSummary | null;
};

export type PortalActiveEventContext = {
  selectedEvent: PortalEventSummary | null;
  activeEvent: PortalEventSummary | null;
  hasActiveEvent: boolean;
  hasEvents: boolean;
  isReadOnly: boolean;
  isRegistrationOpen: boolean;
  activeEventRegistrationReadiness?: EventRegistrationReadiness | null;
};

export type PortalEventContext = PortalActiveEventContext & {
  activeEventRegistrationReadiness: EventRegistrationReadiness | null;
};

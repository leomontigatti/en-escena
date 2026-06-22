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

export type PortalActiveEventSummaryContext = {
  activeEvent: PortalEventSummary | null;
};

export type PortalShellEventContext = PortalActiveEventSummaryContext;

export type PortalActiveEventContext = {
  selectedEvent: PortalEventSummary | null;
  activeEvent: PortalEventSummary | null;
  hasActiveEvent: boolean;
  hasEvents: boolean;
  isReadOnly: boolean;
  isRegistrationOpen: boolean;
};

export type PortalEventContext = PortalActiveEventContext & {
  activeEventRegistrationReadiness: EventRegistrationReadiness | null;
};

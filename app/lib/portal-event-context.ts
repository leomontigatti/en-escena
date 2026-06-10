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
  hasEvents: boolean;
  isReadOnly: boolean;
  isRegistrationOpen: boolean;
};

export type EventRegistrationMissingCode =
  | "categories"
  | "modalities"
  | "schedule-blocks"
  | "schedule-entries"
  | "prices"
  | "schedule-compatibility"
  | "price-coverage";

export type EventRegistrationMissingItem = {
  code: EventRegistrationMissingCode;
  label: string;
  detail: string;
};

export type EventRegistrationReadiness = {
  eventId: string;
  isReady: boolean;
  missingItems: EventRegistrationMissingItem[];
};

import type { EventRegistrationReadiness } from "@/lib/events/registration-readiness";
import type { PaymentInstructions } from "@/lib/finances/payment-instructions";

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

/**
 * The active event plus its `Instrucciones de pago`, for the one portal page
 * that shows them. `paymentInstructions` is `null` when the event has nothing
 * loaded, and no other portal page carries the field.
 */
export type PortalActiveEventPaymentInstructionsContext =
  PortalActiveEventSummaryContext & {
    paymentInstructions: PaymentInstructions | null;
  };

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

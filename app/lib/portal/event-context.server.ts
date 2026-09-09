import { db } from "@/db";
import { getEventRegistrationReadiness } from "@/lib/events/registration-readiness.server";
import { toPaymentInstructions } from "@/lib/finances/payment-instructions";
import type {
  PortalActiveEventContext,
  PortalActiveEventPaymentInstructionsContext,
  PortalActiveEventSummaryContext,
  PortalEventContext,
  PortalShellEventContext,
  PortalEventSummary,
} from "@/lib/portal/event-context";

export async function getPortalShellEventContext(
  _request: Request,
): Promise<PortalShellEventContext> {
  return {
    activeEvent: await findPortalActiveEventSummary(),
  };
}

export async function getPortalActiveEventSummaryContext(
  _request: Request,
): Promise<PortalActiveEventSummaryContext> {
  return {
    activeEvent: await findPortalActiveEventSummary(),
  };
}

/**
 * The active event and its payment instructions in the single query the summary
 * already costs — the payments page needs both, and no other portal page pays
 * for the six extra columns.
 */
export async function getPortalActiveEventPaymentInstructionsContext(
  _request: Request,
): Promise<PortalActiveEventPaymentInstructionsContext> {
  const events = await db.query.events.findMany({
    columns: {
      ...portalEventSummaryColumns,
      paymentInstructionsCbu: true,
      paymentInstructionsAlias: true,
      paymentInstructionsHolderName: true,
      paymentInstructionsBankName: true,
      paymentInstructionsHolderCuit: true,
      paymentInstructionsText: true,
    },
    orderBy: (table, { desc }) => [desc(table.startsAt), desc(table.createdAt)],
  });

  const activeEvent = events.find((event) => event.active) ?? null;

  if (!activeEvent) {
    return { activeEvent: null, paymentInstructions: null };
  }

  return {
    activeEvent: {
      id: activeEvent.id,
      name: activeEvent.name,
      active: activeEvent.active,
      registrationStartsAt: activeEvent.registrationStartsAt,
      registrationEndsAt: activeEvent.registrationEndsAt,
      startsAt: activeEvent.startsAt,
      endsAt: activeEvent.endsAt,
    },
    paymentInstructions: toPaymentInstructions(activeEvent),
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

async function findPortalActiveEventSummary() {
  const events = await listPortalEventSummaries();
  return events.find((event) => event.active) ?? null;
}

const portalEventSummaryColumns = {
  id: true,
  name: true,
  active: true,
  registrationStartsAt: true,
  registrationEndsAt: true,
  startsAt: true,
  endsAt: true,
} as const;

async function listPortalEventSummaries(): Promise<PortalEventSummary[]> {
  return db.query.events.findMany({
    columns: portalEventSummaryColumns,
    orderBy: (table, { desc }) => [desc(table.startsAt), desc(table.createdAt)],
  });
}

function isRegistrationWindowOpen(event: PortalEventSummary | null, now: Date) {
  if (!event) {
    return false;
  }

  return event.registrationStartsAt <= now && now <= event.registrationEndsAt;
}

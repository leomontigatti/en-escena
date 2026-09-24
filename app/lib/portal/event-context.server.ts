import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { schedules } from "@/db/schema";
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
  const activeEvent = await findPortalActiveEventSummary();

  return {
    activeEvent,
    isRegistrationOpen: await isEventRegistrationOpen(activeEvent?.id ?? null),
  };
}

/**
 * The one implementation of "las inscripciones están abiertas" for an event:
 * open when any of its `Cronograma`s is open, closed when none is and closed
 * when the event has none at all. Nothing stores the event-level fact, so
 * display and enforcement cannot drift.
 */
export async function isEventRegistrationOpen(
  eventId: string | null,
): Promise<boolean> {
  if (!eventId) {
    return false;
  }

  const openSchedule = await db.query.schedules.findFirst({
    columns: { id: true },
    where: and(
      eq(schedules.eventId, eventId),
      eq(schedules.registrationOpen, true),
    ),
  });

  return openSchedule !== undefined;
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
 *
 * This restates `listPortalEventSummaries`'s query and the active-event pick on
 * purpose. A `columns` parameter on that function would collapse the two, but
 * Drizzle widens the inferred row type enough to need casts at every caller;
 * the duplication is the cheaper of the two.
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
    activeEvent: toPortalEventSummary(activeEvent),
    paymentInstructions: toPaymentInstructions(activeEvent),
  };
}

export async function getPortalActiveEventContext(
  _request: Request,
): Promise<PortalActiveEventContext> {
  const events = await listPortalEventSummaries();
  const activeEvent = events.find((event) => event.active) ?? null;
  const selectedEvent = activeEvent;

  return {
    selectedEvent,
    activeEvent,
    hasActiveEvent: activeEvent !== null,
    hasEvents: events.length > 0,
    isReadOnly: selectedEvent ? !selectedEvent.active : true,
    isRegistrationOpen: await isEventRegistrationOpen(
      selectedEvent?.id ?? null,
    ),
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

/** The summary's five fields out of a row that carries more of them. */
function toPortalEventSummary(event: PortalEventSummary): PortalEventSummary {
  return {
    id: event.id,
    name: event.name,
    active: event.active,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
  };
}

const portalEventSummaryColumns = {
  id: true,
  name: true,
  active: true,
  startsAt: true,
  endsAt: true,
} as const;

async function listPortalEventSummaries(): Promise<PortalEventSummary[]> {
  return db.query.events.findMany({
    columns: portalEventSummaryColumns,
    orderBy: (table, { desc }) => [desc(table.startsAt), desc(table.createdAt)],
  });
}

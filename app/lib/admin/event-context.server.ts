import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { events as eventsTable } from "@/db/schema";
import type {
  AdminShellEventContext,
  EventOption,
} from "@/lib/admin/event-context.shared";
import { getEventStatus } from "@/lib/events/event-status";

type ResolveAdminEventContextInput = {
  events: EventOption[];
};

export type EventContext = {
  events: EventOption[];
  selectedEventId: string | null;
  redirectTo: string | null;
};

export async function loadShellEventContext(): Promise<AdminShellEventContext> {
  const activeEvent = await db.query.events.findFirst({
    columns: {
      id: true,
      name: true,
      startsAt: true,
      endsAt: true,
    },
    where: eq(eventsTable.active, true),
    orderBy: [desc(eventsTable.startsAt)],
  });

  if (!activeEvent) {
    return { activeEvent: null };
  }

  return {
    activeEvent: { id: activeEvent.id, name: activeEvent.name },
    eventStatus: getEventStatus(activeEvent, new Date()),
  };
}

export async function loadEventContext(
  _request: Request,
): Promise<EventContext> {
  const events = await db.query.events.findMany({
    columns: {
      id: true,
      name: true,
      active: true,
    },
    orderBy: [desc(eventsTable.active), desc(eventsTable.startsAt)],
  });

  return {
    events,
    ...resolveEventContext({ events }),
  };
}

export function resolveEventContext({ events }: ResolveAdminEventContextInput) {
  const activeEvent = events.find((event) => event.active);

  return { selectedEventId: activeEvent?.id ?? null, redirectTo: null };
}

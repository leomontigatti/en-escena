import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { events as eventsTable } from "@/db/schema";
import type { EventOption } from "@/lib/admin/event-context.shared";

type ResolveAdminEventContextInput = {
  events: EventOption[];
};

export type AdminShellEventContext = {
  events: EventOption[];
  selectedEventId: string | null;
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
      active: true,
    },
    where: eq(eventsTable.active, true),
    orderBy: [desc(eventsTable.startsAt)],
  });

  return {
    events: activeEvent ? [activeEvent] : [],
    selectedEventId: activeEvent?.id ?? null,
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

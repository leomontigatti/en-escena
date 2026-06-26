import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { events as eventsTable } from "@/db/schema";
import type { AdminEventOption } from "@/lib/admin/event-context.shared";

type ResolveAdminEventContextInput = {
  events: AdminEventOption[];
};

export type AdminShellEventContext = {
  events: AdminEventOption[];
  selectedEventId: string | null;
};

export type AdminEventContext = {
  events: AdminEventOption[];
  selectedEventId: string | null;
  redirectTo: string | null;
};

export async function loadAdminShellEventContext(): Promise<AdminShellEventContext> {
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

export async function loadAdminEventContext(
  _request: Request,
): Promise<AdminEventContext> {
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
    ...resolveAdminEventContext({ events }),
  };
}

export function resolveAdminEventContext({
  events,
}: ResolveAdminEventContextInput) {
  const activeEvent = events.find((event) => event.active);

  return { selectedEventId: activeEvent?.id ?? null, redirectTo: null };
}

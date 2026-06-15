import { desc } from "drizzle-orm";

import { db } from "@/db";
import { events as eventsTable } from "@/db/schema";
import type { AdminEventOption } from "@/lib/admin/event-context.shared";

type ResolveAdminEventContextInput = {
  requestUrl: string;
  events: AdminEventOption[];
};

export type AdminEventContext = {
  events: AdminEventOption[];
  selectedEventId: string | null;
  redirectTo: string | null;
};

export async function loadAdminEventContext(
  request: Request,
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
    ...resolveAdminEventContext({
      requestUrl: request.url,
      events,
    }),
  };
}

export function resolveAdminEventContext({
  events,
}: ResolveAdminEventContextInput) {
  const activeEvent = events.find((event) => event.active);

  return { selectedEventId: activeEvent?.id ?? null, redirectTo: null };
}

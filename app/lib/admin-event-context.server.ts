import { desc } from "drizzle-orm";

import { db } from "@/db";
import { events as eventsTable } from "@/db/schema";
import type { AdminEventOption } from "@/lib/admin-event-context.shared";

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
  requestUrl,
  events,
}: ResolveAdminEventContextInput) {
  const url = new URL(requestUrl);
  const requestedEventId = url.searchParams.get("evento");
  const requestedEvent = events.find((event) => event.id === requestedEventId);
  const activeEvent = events.find((event) => event.active);

  if (requestedEvent) {
    return { selectedEventId: requestedEvent.id, redirectTo: null };
  }

  if (!activeEvent) {
    if (requestedEventId) {
      url.searchParams.delete("evento");

      return { selectedEventId: null, redirectTo: toPathAndSearch(url) };
    }

    return { selectedEventId: null, redirectTo: null };
  }

  const selectedEventId = activeEvent.id;
  url.searchParams.set("evento", selectedEventId);

  return { selectedEventId, redirectTo: toPathAndSearch(url) };
}

function toPathAndSearch(url: URL) {
  return `${url.pathname}${url.search}`;
}

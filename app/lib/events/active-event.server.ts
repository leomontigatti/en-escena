import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { events } from "@/db/schema";
import { getBusinessDateOnly } from "@/lib/shared/business-time-zone";

/**
 * The active event's start day as the administration reads it, or null when no
 * event is active. Rules measured against the event — the dancer birth-date
 * minimum age among them — need the day, not the instant.
 */
export async function findActiveEventStartDateOnly(): Promise<string | null> {
  const activeEvent = await db.query.events.findFirst({
    columns: { startsAt: true },
    where: eq(events.active, true),
    orderBy: [desc(events.startsAt)],
  });

  return activeEvent ? getBusinessDateOnly(activeEvent.startsAt) : null;
}

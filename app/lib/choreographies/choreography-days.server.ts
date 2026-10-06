import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { choreographies, schedules } from "@/db/schema";
import { formatScheduleDayLabel } from "@/lib/choreographies/schedule-formatters";
import { readListFacet } from "@/lib/list-query/list-query";
import { isDateOnly } from "@/lib/shared/date-only";

export type ChoreographyDayOption = { label: string; value: string };

/**
 * The `Día` facet of the dancer and professor lists, as the URL writes it: the
 * schedule's own `YYYY-MM-DD`, like the choreography list's. Anything else is
 * dropped here, and a day the event's choreographies do not fall on is dropped
 * by `keepKnownChoreographyDay`.
 */
export function readChoreographyDayFilter(searchParams: URLSearchParams) {
  const value = readListFacet(searchParams, "dia");

  return value !== null && isDateOnly(value) ? value : null;
}

/**
 * The days the event's choreographies fall on, in calendar order: the same
 * options the choreography list's `Día` offers, so the lists agree.
 */
export async function listEventChoreographyDays(
  eventId: string,
): Promise<ChoreographyDayOption[]> {
  const rows = await db
    .selectDistinct({ scheduledDate: schedules.scheduledDate })
    .from(choreographies)
    .innerJoin(schedules, eq(schedules.id, choreographies.scheduleId))
    .where(eq(choreographies.eventId, eventId))
    .orderBy(asc(schedules.scheduledDate));

  return rows.map((row) => ({
    label: formatScheduleDayLabel(row.scheduledDate),
    value: row.scheduledDate,
  }));
}

export function keepKnownChoreographyDay(
  day: string | null,
  options: ChoreographyDayOption[],
) {
  return day !== null && options.some((option) => option.value === day)
    ? day
    : null;
}

import { and, eq, sql, type AnyColumn, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { events } from "@/db/schema";
import { loadEventContext } from "@/lib/admin/event-context.server";
import { requireInternalUser } from "@/lib/auth/internal-access.server";
import { BUSINESS_TIME_ZONE } from "@/lib/shared/business-time-zone";

import { readExportPeriod, type ExportPeriod } from "./shared";

/**
 * What every auditor export reads before its own rows: the auditor, the event
 * selected in the shell and the period asked for. The exports are the
 * auditor's alone for now (PRD #1448), so the administrator is refused too.
 * Not found only when there is no event, which the list itself already says;
 * a period with nothing in it is still a file.
 */
export async function readPeriodExport(request: Request): Promise<{
  eventId: string;
  eventName: string;
  period: ExportPeriod;
}> {
  await requireInternalUser(request, ["auditor"]);
  const { selectedEventId } = await loadEventContext(request);
  const [event] =
    selectedEventId === null
      ? []
      : await db
          .select({ id: events.id, name: events.name })
          .from(events)
          .where(eq(events.id, selectedEventId));

  if (!event) {
    throw new Response("Evento no encontrado", { status: 404 });
  }

  return {
    eventId: event.id,
    eventName: event.name,
    period: readExportPeriod(new URL(request.url).searchParams),
  };
}

/**
 * A moment inside the period: on or after the start of `Desde` and before the
 * start of the day after `Hasta`, both midnights in Argentina time, so a
 * movement at 23:30 on the last day is in.
 */
export function timestampInPeriod(
  column: AnyColumn,
  period: ExportPeriod,
): SQL | undefined {
  return and(
    period.from === null
      ? undefined
      : sql`${column} >= (${period.from}::date)::timestamp at time zone ${BUSINESS_TIME_ZONE}`,
    period.to === null
      ? undefined
      : sql`${column} < (${period.to}::date + 1)::timestamp at time zone ${BUSINESS_TIME_ZONE}`,
  );
}

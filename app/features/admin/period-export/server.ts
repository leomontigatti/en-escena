import { and, eq, exists, sql, type AnyColumn, type SQL } from "drizzle-orm";

import { db } from "@/db";
import {
  choreographies,
  choreographyDancers,
  events,
  seminarInscriptions,
  seminars,
} from "@/db/schema";
import { loadEventContext } from "@/lib/admin/event-context.server";
import { requireInternalUser } from "@/lib/auth/internal-access.server";
import { activeInscription } from "@/lib/choreographies/active-inscription";
import { activeSeminarInscription } from "@/lib/seminars/active-inscription";
import { BUSINESS_TIME_ZONE } from "@/lib/shared/business-time-zone";

import {
  periodToBeforeFromMessage,
  readExportPeriod,
  type ExportPeriod,
} from "./shared";

/**
 * What every auditor export reads before its own rows: the auditor, the event
 * selected in the shell and the period asked for. The exports are the
 * auditor's alone for now (PRD #1448), so the administrator is refused too.
 * A reversed period is refused with 400. Not found only when there is no event, which the list itself already says;
 * a period with nothing in it is still a file.
 */
export async function readPeriodExport(request: Request): Promise<{
  eventId: string;
  eventName: string;
  period: ExportPeriod;
}> {
  await requireInternalUser(request, ["auditor"]);
  const period = readExportPeriod(new URL(request.url).searchParams);

  if (period.from !== null && period.to !== null && period.from > period.to) {
    throw new Response(periodToBeforeFromMessage, { status: 400 });
  }

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
    period,
  };
}

/**
 * A moment inside the period: on or after the start of `Desde` and before the
 * start of the day after `Hasta`, both midnights in Argentina time, so a
 * movement at 23:30 on the last day is in.
 */
function timestampInPeriod(
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

/**
 * What makes an inscription count for the auditor's period exports: an active
 * choreography inscription of the event, registered in the period. The query
 * joins `choreographyDancers` to `choreographies`.
 */
export function inscriptionRegisteredInPeriod(
  eventId: string,
  period: ExportPeriod,
): SQL | undefined {
  return and(
    inscriptionOfAnyStateRegisteredInPeriod(eventId, period),
    activeInscription(),
  );
}

/**
 * The same inscriptions plus the withdrawn ones registered in the period, for
 * the export that follows their money: a withdrawn inscription no longer
 * counts as one, and what stays allocated to it is still money of the event.
 */
export function inscriptionOfAnyStateRegisteredInPeriod(
  eventId: string,
  period: ExportPeriod,
): SQL | undefined {
  return and(
    eq(choreographies.eventId, eventId),
    timestampInPeriod(choreographyDancers.createdAt, period),
  );
}

/**
 * The seminar twin, for the three lists (not the counts, which have no
 * modality to give a seminar): an active seminar inscription in a seminar of
 * the event, registered in the period by its `createdAt`, the date the person
 * was first registered. The query joins `seminarInscriptions` to `seminars`.
 */
export function seminarInscriptionRegisteredInPeriod(
  eventId: string,
  period: ExportPeriod,
): SQL | undefined {
  return and(
    eq(seminars.eventId, eventId),
    activeSeminarInscription(),
    timestampInPeriod(seminarInscriptions.createdAt, period),
  );
}

/**
 * Whether the person in `personColumn` (a dancer's or a professor's id) holds
 * a seminar inscription that counts for the period.
 */
export function holdsSeminarInscriptionInPeriod(
  person: "dancer" | "professor",
  personColumn: AnyColumn,
  eventId: string,
  period: ExportPeriod,
): SQL {
  return exists(
    db
      .select({ id: seminarInscriptions.id })
      .from(seminarInscriptions)
      .innerJoin(seminars, eq(seminars.id, seminarInscriptions.seminarId))
      .where(
        and(
          eq(
            person === "dancer"
              ? seminarInscriptions.dancerId
              : seminarInscriptions.professorId,
            personColumn,
          ),
          seminarInscriptionRegisteredInPeriod(eventId, period),
        ),
      ),
  );
}

/** A date-only column inside the period, both ends included. */
export function dateInPeriod(
  column: AnyColumn,
  period: ExportPeriod,
): SQL | undefined {
  return and(
    period.from === null ? undefined : sql`${column} >= ${period.from}`,
    period.to === null ? undefined : sql`${column} <= ${period.to}`,
  );
}

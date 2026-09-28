import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { events, schedules } from "@/db/schema";
import { loadEventContext } from "@/lib/admin/event-context.server";
import { requireInternalUser } from "@/lib/auth/internal-access.server";
import type { ChoreographyGroupType } from "@/lib/portal/choreographies";
import { readPresentationResults } from "@/lib/judging/presentation-results.server";
import {
  readEventProgram,
  type EventProgramSchedule,
} from "@/lib/presentations/event-program.server";

import { resultsPrintScheduleParam, type ResultsPrintRow } from "./shared";

export { resultsPrintScheduleParam } from "./shared";

/**
 * The results print: the printed program of the schedules the administration
 * chose, with the average and the medal of each presentation. See
 * docs/domain/judging.md, "Program And Results".
 *
 * It reads results live and never asks whether they are published: the sheet
 * is for the organisation, and it is printed before the academies see anything.
 * It lists only what has a result: presentations not evaluated yet and
 * disqualified ones are left out.
 */

export type ResultsPrintLoaderData = {
  eventName: string;
  rows: ResultsPrintRow[];
  schedules: EventProgramSchedule[];
};

/**
 * Only a solo is named: the print is read for results, and one name is all the
 * row needs to tell the presentation apart. The program itself names duos too.
 */
function namesDancersOnResultsPrint(groupType: ChoreographyGroupType) {
  return groupType === "solo";
}

export async function loadResultsPrint(
  request: Request,
): Promise<ResultsPrintLoaderData> {
  await requireInternalUser(request, ["admin"]);
  const { selectedEventId } = await loadEventContext(request);
  const scheduleIds = [
    ...new Set(
      new URL(request.url).searchParams.getAll(resultsPrintScheduleParam),
    ),
  ];

  if (selectedEventId === null || scheduleIds.length === 0) {
    throw new Response("Cronograma no encontrado", { status: 404 });
  }

  const [event] = await db
    .select({ name: events.name })
    .from(events)
    .where(eq(events.id, selectedEventId));
  const found = await db
    .select({ id: schedules.id })
    .from(schedules)
    .where(
      and(
        eq(schedules.eventId, selectedEventId),
        inArray(schedules.id, scheduleIds),
      ),
    );

  if (!event || found.length !== scheduleIds.length) {
    throw new Response("Cronograma no encontrado", { status: 404 });
  }

  const program = await readEventProgram(selectedEventId, db, {
    namesDancersOf: namesDancersOnResultsPrint,
  });
  const rows = program.rows.filter((row) =>
    scheduleIds.includes(row.scheduleId),
  );
  const results = await readPresentationResults(
    rows.map((row) => row.choreographyId),
  );
  // Only what has a result is printed: a presentation not evaluated yet, or
  // disqualified, has no average and no medal to put on the sheet.
  const printed = rows.flatMap((row): ResultsPrintRow[] => {
    const result = results.get(row.choreographyId);

    if (!result || result.average === null || result.medal === null) {
      return [];
    }

    return [{ ...row, average: result.average, medal: result.medal }];
  });
  const printedScheduleIds = new Set(printed.map((row) => row.scheduleId));

  return {
    eventName: event.name,
    rows: printed,
    // The program's schedules are already in day and time order, and a chosen
    // schedule with nothing to print has no page.
    schedules: program.schedules.filter((schedule) =>
      printedScheduleIds.has(schedule.id),
    ),
  };
}

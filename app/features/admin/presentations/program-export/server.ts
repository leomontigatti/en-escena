import { asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { choreographyProfessors, events, professors } from "@/db/schema";
import { spreadsheetResponse } from "@/features/admin/day-export/server";
import {
  buildExportFileName,
  exportDayParam,
  isOnExportDay,
} from "@/features/admin/day-export/shared";
import { loadEventContext } from "@/lib/admin/event-context.server";
import { requireInternalUser } from "@/lib/auth/internal-access.server";
import type { ChoreographyGroupType } from "@/lib/portal/choreographies";
import { readEventProgram } from "@/lib/presentations/event-program.server";

import { programExportColumns, type ProgramExportRow } from "./sheet";

/**
 * The program as a spreadsheet, for the organisation to work on outside the
 * app: every presentation of the event, or of one day, in running order. It is
 * the program the public reads, so a disqualified presentation stays in it.
 */

/** A row has room for a trio's names; a larger group's would bury it. */
function namesDancersOnExport(groupType: ChoreographyGroupType) {
  return groupType !== "grupal";
}

/**
 * What every export of the program reads: the administrator, the active event
 * and the day asked for, and the program's rows on that day. Not found when
 * any of them is missing, since a download has no page to say so on.
 */
export async function readProgramExport(
  request: Request,
  options: { namesDancersOf: (groupType: ChoreographyGroupType) => boolean },
): Promise<{
  day: string;
  eventName: string;
  /** With the choreography, which a richer export reads more about. */
  rows: (ProgramExportRow & { choreographyId: string })[];
}> {
  await requireInternalUser(request, ["admin"]);
  const { selectedEventId } = await loadEventContext(request);
  const day = new URL(request.url).searchParams.get(exportDayParam);

  if (selectedEventId === null || !day) {
    throw new Response("Día no encontrado", { status: 404 });
  }

  const [[event], program] = await Promise.all([
    db
      .select({ name: events.name })
      .from(events)
      .where(eq(events.id, selectedEventId)),
    readEventProgram(selectedEventId, db, options),
  ]);
  const schedulesById = new Map(
    program.schedules.map((schedule) => [schedule.id, schedule]),
  );
  const rows = program.rows.flatMap((row) => {
    const schedule = schedulesById.get(row.scheduleId);

    if (
      !schedule ||
      row.orderNumber === null ||
      !isOnExportDay(day, row.scheduledDate)
    ) {
      return [];
    }

    return [
      {
        ...row,
        orderNumber: row.orderNumber,
        scheduleName: schedule.name,
        startTime: schedule.startTime,
      },
    ];
  });

  if (!event || rows.length === 0) {
    throw new Response("Día no encontrado", { status: 404 });
  }

  const professorNames = await readProfessorNames(
    rows.map((row) => row.choreographyId),
  );

  return {
    day,
    eventName: event.name,
    rows: rows.map((row) => ({
      ...row,
      professorNames: professorNames.get(row.choreographyId) ?? [],
    })),
  };
}

/** Each choreography's professors, by surname and then name. */
async function readProfessorNames(
  choreographyIds: string[],
): Promise<Map<string, string[]>> {
  const linked = await db
    .select({
      choreographyId: choreographyProfessors.choreographyId,
      firstName: professors.firstName,
      lastName: professors.lastName,
    })
    .from(choreographyProfessors)
    .innerJoin(
      professors,
      eq(professors.id, choreographyProfessors.professorId),
    )
    .where(inArray(choreographyProfessors.choreographyId, choreographyIds))
    .orderBy(asc(professors.lastName), asc(professors.firstName));
  const byChoreography = new Map<string, string[]>();

  for (const professor of linked) {
    byChoreography.set(professor.choreographyId, [
      ...(byChoreography.get(professor.choreographyId) ?? []),
      `${professor.firstName} ${professor.lastName}`,
    ]);
  }

  return byChoreography;
}

export async function loadProgramExport(request: Request): Promise<Response> {
  const { day, eventName, rows } = await readProgramExport(request, {
    namesDancersOf: namesDancersOnExport,
  });

  return await spreadsheetResponse({
    columns: programExportColumns,
    fileName: buildExportFileName("programa", eventName, day),
    rows,
    sheet: "Programa",
  });
}

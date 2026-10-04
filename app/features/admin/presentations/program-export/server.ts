import { eq } from "drizzle-orm";
import writeXlsxFile from "write-excel-file/node";

import { db } from "@/db";
import { events } from "@/db/schema";
import { loadEventContext } from "@/lib/admin/event-context.server";
import { requireInternalUser } from "@/lib/auth/internal-access.server";
import type { ChoreographyGroupType } from "@/lib/portal/choreographies";
import { readEventProgram } from "@/lib/presentations/event-program.server";

import { buildProgramSheet, programExportColumns } from "./sheet";
import {
  buildProgramExportFileName,
  programExportAllDays,
  programExportDayParam,
} from "./shared";

/**
 * The program as a spreadsheet, for the organisation to work on outside the
 * app: every presentation of the event, or of one day, in running order. It is
 * the program the public reads, so a disqualified presentation stays in it.
 */

/** A row has room for a trio's names; a larger group's would bury it. */
function namesDancersOnExport(groupType: ChoreographyGroupType) {
  return groupType !== "grupal";
}

export async function loadProgramExport(request: Request): Promise<Response> {
  await requireInternalUser(request, ["admin"]);
  const { selectedEventId } = await loadEventContext(request);
  const day = new URL(request.url).searchParams.get(programExportDayParam);

  if (selectedEventId === null || !day) {
    throw new Response("Día no encontrado", { status: 404 });
  }

  const [[event], program] = await Promise.all([
    db
      .select({ name: events.name })
      .from(events)
      .where(eq(events.id, selectedEventId)),
    readEventProgram(selectedEventId, db, {
      namesDancersOf: namesDancersOnExport,
    }),
  ]);
  const schedulesById = new Map(
    program.schedules.map((schedule) => [schedule.id, schedule]),
  );
  const rows = program.rows.flatMap((row) => {
    const schedule = schedulesById.get(row.scheduleId);

    if (
      !schedule ||
      row.orderNumber === null ||
      (day !== programExportAllDays && row.scheduledDate !== day)
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

  const workbook = await writeXlsxFile(buildProgramSheet(rows), {
    columns: programExportColumns.map(({ width }) => ({ width })),
    sheet: "Programa",
    stickyRowsCount: 1,
  }).toBuffer();

  return new Response(new Uint8Array(workbook), {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="${buildProgramExportFileName(event.name, day)}"`,
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  });
}

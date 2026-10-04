import { and, asc, eq, exists } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  choreographies,
  choreographyDancers,
  choreographyProfessors,
  professors,
} from "@/db/schema";
import { spreadsheetResponse } from "@/features/admin/day-export/server";
import {
  readPeriodExport,
  timestampInPeriod,
} from "@/features/admin/period-export/server";
import { buildPeriodExportFileName } from "@/features/admin/period-export/shared";
import { activeInscription } from "@/lib/choreographies/active-inscription";

import { professorsExportColumns } from "./sheet";

/**
 * The professors of the selected event as a spreadsheet, for the auditor. A
 * professor has no inscription of their own, so they are listed when a
 * choreography they teach has an active inscription registered in the period.
 * One row per professor of an academy's roster, whatever the number of such
 * inscriptions.
 */
export async function loadProfessorsExport(
  request: Request,
): Promise<Response> {
  const { eventId, eventName, period } = await readPeriodExport(request);
  const rows = await db
    .select({
      academyName: academies.name,
      documentNumber: professors.documentNumber,
      documentType: professors.documentType,
      firstName: professors.firstName,
      lastName: professors.lastName,
    })
    .from(professors)
    .innerJoin(academies, eq(academies.id, professors.academyId))
    .where(
      exists(
        db
          .select({ id: choreographyDancers.id })
          .from(choreographyProfessors)
          .innerJoin(
            choreographies,
            eq(choreographies.id, choreographyProfessors.choreographyId),
          )
          .innerJoin(
            choreographyDancers,
            eq(choreographyDancers.choreographyId, choreographies.id),
          )
          .where(
            and(
              eq(choreographyProfessors.professorId, professors.id),
              eq(choreographies.eventId, eventId),
              activeInscription(),
              timestampInPeriod(choreographyDancers.createdAt, period),
            ),
          ),
      ),
    )
    .orderBy(
      asc(academies.name),
      asc(professors.lastName),
      asc(professors.firstName),
    );

  return await spreadsheetResponse({
    columns: professorsExportColumns,
    fileName: buildPeriodExportFileName("profesores", eventName, period),
    rows,
    sheet: "Profesores",
  });
}

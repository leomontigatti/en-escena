import { and, asc, eq, exists, or } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  choreographies,
  choreographyDancers,
  choreographyProfessors,
  professors,
  seminarInscriptions,
  seminars,
} from "@/db/schema";
import { spreadsheetResponse } from "@/features/admin/day-export/server";
import {
  inscriptionRegisteredInPeriod,
  readPeriodExport,
  seminarInscriptionRegisteredInPeriod,
} from "@/features/admin/period-export/server";
import { buildPeriodExportFileName } from "@/features/admin/period-export/shared";

import { professorsExportColumns } from "./sheet";

/**
 * The professors of the selected event as a spreadsheet, for the auditor. A
 * professor has no inscription of their own, so they are listed when a
 * choreography they teach has an active inscription registered in the period,
 * or when they hold an active seminar inscription of their own registered in it.
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
      or(
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
                inscriptionRegisteredInPeriod(eventId, period),
              ),
            ),
        ),
        exists(
          db
            .select({ id: seminarInscriptions.id })
            .from(seminarInscriptions)
            .innerJoin(seminars, eq(seminars.id, seminarInscriptions.seminarId))
            .where(
              and(
                eq(seminarInscriptions.professorId, professors.id),
                seminarInscriptionRegisteredInPeriod(eventId, period),
              ),
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

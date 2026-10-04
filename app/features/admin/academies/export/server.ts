import { and, asc, eq, exists, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  choreographies,
  choreographyDancers,
  dancers,
  professors,
  seminarInscriptions,
  seminars,
  user,
} from "@/db/schema";
import { spreadsheetResponse } from "@/features/admin/day-export/server";
import {
  inscriptionRegisteredInPeriod,
  readPeriodExport,
  seminarInscriptionRegisteredInPeriod,
} from "@/features/admin/period-export/server";
import { buildPeriodExportFileName } from "@/features/admin/period-export/shared";

import { academiesExportColumns } from "./sheet";

/**
 * The academies of the selected event as a spreadsheet, for the auditor: every
 * academy with an active choreography or seminar inscription registered in
 * the period, with its
 * responsible, its phone and the email it logs in with.
 */
export async function loadAcademiesExport(request: Request): Promise<Response> {
  const { eventId, eventName, period } = await readPeriodExport(request);
  const rows = await db
    .select({
      contactName: academies.contactName,
      email: user.email,
      name: academies.name,
      phone: academies.phone,
    })
    .from(academies)
    .innerJoin(user, eq(user.id, academies.userId))
    .where(
      or(
        exists(
          db
            .select({ id: choreographyDancers.id })
            .from(choreographies)
            .innerJoin(
              choreographyDancers,
              eq(choreographyDancers.choreographyId, choreographies.id),
            )
            .where(
              and(
                eq(choreographies.academyId, academies.id),
                inscriptionRegisteredInPeriod(eventId, period),
              ),
            ),
        ),
        // A seminar inscription belongs to the academy of the person it
        // registers, dancer or professor.
        exists(
          db
            .select({ id: seminarInscriptions.id })
            .from(seminarInscriptions)
            .innerJoin(seminars, eq(seminars.id, seminarInscriptions.seminarId))
            .leftJoin(dancers, eq(dancers.id, seminarInscriptions.dancerId))
            .leftJoin(
              professors,
              eq(professors.id, seminarInscriptions.professorId),
            )
            .where(
              and(
                eq(
                  sql`coalesce(${dancers.academyId}, ${professors.academyId})`,
                  academies.id,
                ),
                seminarInscriptionRegisteredInPeriod(eventId, period),
              ),
            ),
        ),
      ),
    )
    .orderBy(asc(academies.name));

  return await spreadsheetResponse({
    columns: academiesExportColumns,
    fileName: buildPeriodExportFileName("academias", eventName, period),
    rows,
    sheet: "Academias",
  });
}

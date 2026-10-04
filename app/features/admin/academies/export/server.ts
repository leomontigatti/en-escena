import { and, asc, eq, exists } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  choreographies,
  choreographyDancers,
  user,
} from "@/db/schema";
import { spreadsheetResponse } from "@/features/admin/day-export/server";
import {
  inscriptionRegisteredInPeriod,
  readPeriodExport,
} from "@/features/admin/period-export/server";
import { buildPeriodExportFileName } from "@/features/admin/period-export/shared";

import { academiesExportColumns } from "./sheet";

/**
 * The academies of the selected event as a spreadsheet, for the auditor: every
 * academy with an active inscription registered in the period, with its
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
    )
    .orderBy(asc(academies.name));

  return await spreadsheetResponse({
    columns: academiesExportColumns,
    fileName: buildPeriodExportFileName("academias", eventName, period),
    rows,
    sheet: "Academias",
  });
}

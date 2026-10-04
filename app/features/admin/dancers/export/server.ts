import { and, asc, eq, exists } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  choreographies,
  choreographyDancers,
  dancers,
} from "@/db/schema";
import { spreadsheetResponse } from "@/features/admin/day-export/server";
import {
  readPeriodExport,
  timestampInPeriod,
} from "@/features/admin/period-export/server";
import { buildPeriodExportFileName } from "@/features/admin/period-export/shared";
import { activeInscription } from "@/lib/choreographies/active-inscription";

import { dancersExportColumns } from "./sheet";

/**
 * The dancers of the selected event as a spreadsheet, for the auditor: every
 * dancer with an active inscription registered in the period, once per
 * academy roster they belong to, whatever the number of inscriptions. Who was
 * typed into a roster without registering is not in it.
 */
export async function loadDancersExport(request: Request): Promise<Response> {
  const { eventId, eventName, period } = await readPeriodExport(request);
  const rows = await db
    .select({
      academyName: academies.name,
      birthDate: dancers.birthDate,
      documentNumber: dancers.documentNumber,
      documentType: dancers.documentType,
      firstName: dancers.firstName,
      lastName: dancers.lastName,
    })
    .from(dancers)
    .innerJoin(academies, eq(academies.id, dancers.academyId))
    .where(
      exists(
        db
          .select({ id: choreographyDancers.id })
          .from(choreographyDancers)
          .innerJoin(
            choreographies,
            eq(choreographies.id, choreographyDancers.choreographyId),
          )
          .where(
            and(
              eq(choreographyDancers.dancerId, dancers.id),
              eq(choreographies.eventId, eventId),
              activeInscription(),
              timestampInPeriod(choreographyDancers.createdAt, period),
            ),
          ),
      ),
    )
    .orderBy(
      asc(academies.name),
      asc(dancers.lastName),
      asc(dancers.firstName),
    );

  return await spreadsheetResponse({
    columns: dancersExportColumns,
    fileName: buildPeriodExportFileName("bailarines", eventName, period),
    rows,
    sheet: "Bailarines",
  });
}

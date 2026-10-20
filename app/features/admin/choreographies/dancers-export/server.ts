import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  choreographies,
  choreographyDancers,
  dancers,
  events,
} from "@/db/schema";
import { spreadsheetResponse } from "@/features/admin/day-export/server";
import { loadEventContext } from "@/lib/admin/event-context.server";
import { requireAdminPanelWriter } from "@/lib/auth/internal-access.server";
import { activeInscription } from "@/lib/choreographies/active-inscription";
import { formatEventSequenceNumber } from "@/lib/events/sequence-number";
import { slugify } from "@/lib/shared/slugify";

import { choreographyDancersExportColumns } from "./sheet";

/**
 * A choreography's dancers as a spreadsheet, for the administrator to hand
 * outside the app: every dancer with an active inscription in it, by surname.
 * A choreography of another event is not found, as on its detail, and a
 * withdrawn one is refused: its inscriptions were withdrawn with it, and the
 * detail says so before the click.
 */
export async function loadChoreographyDancersExport(input: {
  params: { choreographyId?: string };
  request: Request;
}): Promise<Response> {
  await requireAdminPanelWriter(input.request);
  const { selectedEventId } = await loadEventContext(input.request);
  const { choreographyId } = input.params;
  const notFound = new Response("Coreografía no encontrada", { status: 404 });

  if (!choreographyId || selectedEventId === null) {
    throw notFound;
  }

  const [choreography] = await db
    .select({
      choreographyNumber: choreographies.choreographyNumber,
      eventName: events.name,
      name: choreographies.name,
      withdrawnAt: choreographies.withdrawnAt,
    })
    .from(choreographies)
    .innerJoin(events, eq(events.id, choreographies.eventId))
    .where(
      and(
        eq(choreographies.id, choreographyId),
        eq(choreographies.eventId, selectedEventId),
      ),
    );

  if (!choreography) {
    throw notFound;
  }

  if (choreography.withdrawnAt !== null) {
    throw new Response("La coreografía está retirada", { status: 403 });
  }

  const rows = await db
    .select({
      ageAtEventStart: choreographyDancers.ageAtEventStart,
      birthDate: dancers.birthDate,
      documentNumber: dancers.documentNumber,
      documentType: dancers.documentType,
      firstName: dancers.firstName,
      lastName: dancers.lastName,
    })
    .from(choreographyDancers)
    .innerJoin(dancers, eq(dancers.id, choreographyDancers.dancerId))
    .where(
      and(
        eq(choreographyDancers.choreographyId, choreographyId),
        activeInscription(),
      ),
    )
    .orderBy(asc(dancers.lastName), asc(dancers.firstName));

  return await spreadsheetResponse({
    columns: choreographyDancersExportColumns,
    fileName:
      [
        "bailarines",
        slugify(choreography.eventName),
        formatEventSequenceNumber(choreography.choreographyNumber),
        slugify(choreography.name),
      ].join("-") + ".xlsx",
    rows,
    sheet: "Bailarines",
  });
}

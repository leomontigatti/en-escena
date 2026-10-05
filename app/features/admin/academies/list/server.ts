import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { academies, choreographies } from "@/db/schema";
import { loadEventContext } from "@/lib/admin/event-context.server";
import { getAcademyDataStatus } from "@/lib/academies/academy-data-status";
import { canWriteInAdminPanel } from "@/lib/auth/admin-panel-access";
import { requireInternalUser } from "@/lib/auth/internal-access.server";
import { notWithdrawnChoreography } from "@/lib/choreographies/withdrawn-choreography";

export async function loadAcademiesList(request: Request) {
  const user = await requireInternalUser(request, ["admin", "auditor"]);
  const eventContext = await loadEventContext(request);
  const academyRows = await db.query.academies.findMany({
    columns: {
      city: true,
      id: true,
      name: true,
      contactName: true,
      province: true,
    },
    orderBy: [asc(academies.name)],
  });
  const participatingAcademyIds = eventContext.selectedEventId
    ? new Set(
        (
          await db
            .selectDistinct({ academyId: choreographies.academyId })
            .from(choreographies)
            .where(
              and(
                eq(choreographies.eventId, eventContext.selectedEventId),
                notWithdrawnChoreography(),
              ),
            )
        ).map((row) => row.academyId),
      )
    : new Set<string>();

  return {
    academies: academyRows.map(({ city, province, ...academy }) => ({
      ...academy,
      dataStatus: getAcademyDataStatus({ city, province }),
      isParticipating: participatingAcademyIds.has(academy.id),
    })),
    /** False for the auditor, who gets the `Exportar` entry instead. */
    canWrite: canWriteInAdminPanel(user.role),
    selectedEventId: eventContext.selectedEventId,
  };
}

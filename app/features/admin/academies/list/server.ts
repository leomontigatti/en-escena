import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { academies, choreographies } from "@/db/schema";
import { loadAdminEventContext } from "@/lib/admin/event-context.server";
import { requireInternalUser } from "@/lib/auth/internal-access.server";

export async function loadAdministrativeAcademiesList(request: Request) {
  await requireInternalUser(request, ["admin", "auditor"]);
  const eventContext = await loadAdminEventContext(request);
  const academyRows = await db.query.academies.findMany({
    columns: {
      id: true,
      name: true,
      contactName: true,
    },
    orderBy: [asc(academies.name)],
  });
  const participatingAcademyIds = eventContext.selectedEventId
    ? new Set(
        (
          await db
            .selectDistinct({ academyId: choreographies.academyId })
            .from(choreographies)
            .where(eq(choreographies.eventId, eventContext.selectedEventId))
        ).map((row) => row.academyId),
      )
    : new Set<string>();

  return {
    academies: academyRows.map((academy) => ({
      ...academy,
      isParticipating: participatingAcademyIds.has(academy.id),
    })),
    selectedEventId: eventContext.selectedEventId,
  };
}

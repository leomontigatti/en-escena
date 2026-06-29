import { asc } from "drizzle-orm";

import { db } from "@/db";
import { academies } from "@/db/schema";
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
      phone: true,
    },
    orderBy: [asc(academies.name)],
  });

  return {
    academies: academyRows,
    selectedEventId: eventContext.selectedEventId,
  };
}

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { academies, categories, choreographies } from "@/db/schema";
import {
  deriveAdminOperationalStatuses,
  operationalStatusColumns,
} from "@/features/admin/choreographies/operational-status.server";
import { loadEventContext } from "@/lib/admin/event-context.server";
import { requireInternalUser } from "@/lib/auth/internal-access.server";

export type ChoreographyAcademyRow = {
  academyId: string;
  academyName: string;
  /** What is taking part: the withdrawn ones are counted apart. */
  choreographyCount: number;
  /** Taking part and still owing something, the admin's fix list. */
  incompleteCount: number;
  withdrawnCount: number;
};

/**
 * The door to the administration's choreographies: one row per academy that
 * registered anything in the event. An academy whose choreographies were all
 * withdrawn stays, because its withdrawn ones are still read from its page.
 */
export async function loadChoreographyAcademies(request: Request) {
  await requireInternalUser(request, ["admin", "auditor"]);
  const eventContext = await loadEventContext(request);
  const selectedEventId = eventContext.selectedEventId;

  if (selectedEventId === null) {
    return { rows: [] as ChoreographyAcademyRow[], selectedEventId: null };
  }

  return {
    rows: await listChoreographyAcademies(selectedEventId),
    selectedEventId,
  };
}

async function listChoreographyAcademies(
  eventId: string,
): Promise<ChoreographyAcademyRow[]> {
  const rows = await db
    .select({
      ...operationalStatusColumns,
      academyId: choreographies.academyId,
      academyName: academies.name,
      id: choreographies.id,
      withdrawnAt: choreographies.withdrawnAt,
    })
    .from(choreographies)
    .innerJoin(academies, eq(choreographies.academyId, academies.id))
    .innerJoin(categories, eq(choreographies.categoryId, categories.id))
    .where(eq(choreographies.eventId, eventId));
  const academyRows = new Map<string, ChoreographyAcademyRow>();

  for (const { operationalStatus, row } of await deriveAdminOperationalStatuses(
    rows,
  )) {
    const academyRow = academyRows.get(row.academyId) ?? {
      academyId: row.academyId,
      academyName: row.academyName,
      choreographyCount: 0,
      incompleteCount: 0,
      withdrawnCount: 0,
    };

    if (row.withdrawnAt !== null) {
      academyRow.withdrawnCount += 1;
    } else {
      academyRow.choreographyCount += 1;

      if (operationalStatus.code === "incomplete") {
        academyRow.incompleteCount += 1;
      }
    }

    academyRows.set(row.academyId, academyRow);
  }

  return [...academyRows.values()].sort((first, second) =>
    first.academyName.localeCompare(second.academyName, "es-AR", {
      sensitivity: "base",
      numeric: true,
    }),
  );
}

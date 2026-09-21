import { and, eq, inArray } from "drizzle-orm";

import { choreographyDancers, dancers } from "@/db/schema";
import { activeInscription } from "@/lib/choreographies/active-inscription";
import type { Executor } from "@/lib/finances/choreography-cobro-support.server";
import type { ChoreographyGroupType } from "@/lib/portal/choreographies";

/**
 * Who dances, as both program surfaces name them. It is the same answer on the
 * academy's page and on the public program, so it is read in one place: a solo
 * and a duo carry their dancers' names, and nothing else does — a group's list
 * would outgrow the row and the printed page alike.
 */

/** A solo dances alone and a duo in two; past that the names stop fitting. */
export function listsDancerNames(groupType: ChoreographyGroupType) {
  return groupType === "solo" || groupType === "duo";
}

export async function readProgramDancerNames(
  executor: Executor,
  choreographyIds: string[],
): Promise<Map<string, string[]>> {
  const byChoreography = new Map<string, string[]>();

  if (choreographyIds.length === 0) {
    return byChoreography;
  }

  const rows = await executor
    .select({
      choreographyId: choreographyDancers.choreographyId,
      firstName: dancers.firstName,
      lastName: dancers.lastName,
    })
    .from(choreographyDancers)
    .innerJoin(dancers, eq(choreographyDancers.dancerId, dancers.id))
    .where(
      and(
        inArray(choreographyDancers.choreographyId, choreographyIds),
        activeInscription(),
      ),
    );

  for (const row of rows) {
    const bucket = byChoreography.get(row.choreographyId) ?? [];
    bucket.push(`${row.firstName} ${row.lastName}`);
    byChoreography.set(row.choreographyId, bucket);
  }

  return byChoreography;
}

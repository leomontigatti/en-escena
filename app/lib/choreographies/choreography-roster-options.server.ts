import { asc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { dancers, professors } from "@/db/schema";
import type {
  ChoreographyDancerOption,
  ChoreographyProfessorOption,
} from "@/lib/choreographies/choreography-roster.shared";
import {
  isSelectableForRoster,
  toRosterPersonStatus,
} from "@/lib/roster/roster-person-status.shared";

export async function listProfessorOptionsForChoreography(
  academyId: string,
  linkedProfessorIds: string[],
): Promise<ChoreographyProfessorOption[]> {
  const linkedProfessorIdsSet = new Set(linkedProfessorIds);
  const rows = await db
    .select({
      id: professors.id,
      firstName: professors.firstName,
      lastName: professors.lastName,
      active: professors.active,
    })
    .from(professors)
    .where(eq(professors.academyId, academyId))
    .orderBy(
      asc(sql`lower(${professors.firstName})`),
      asc(sql`lower(${professors.lastName})`),
    );

  return rows.filter((professor) =>
    isSelectableForRoster({
      status: toRosterPersonStatus(professor.active),
      isAlreadyLinked: linkedProfessorIdsSet.has(professor.id),
    }),
  );
}

export async function listDancerOptionsForChoreography(
  academyId: string,
  linkedDancerIds: string[],
): Promise<ChoreographyDancerOption[]> {
  const linkedDancerIdsSet = new Set(linkedDancerIds);
  const rows = await db
    .select({
      id: dancers.id,
      firstName: dancers.firstName,
      lastName: dancers.lastName,
      active: dancers.active,
    })
    .from(dancers)
    .where(eq(dancers.academyId, academyId))
    .orderBy(
      asc(sql`lower(${dancers.firstName})`),
      asc(sql`lower(${dancers.lastName})`),
    );

  return rows.filter((dancer) =>
    isSelectableForRoster({
      status: toRosterPersonStatus(dancer.active),
      isAlreadyLinked: linkedDancerIdsSet.has(dancer.id),
    }),
  );
}

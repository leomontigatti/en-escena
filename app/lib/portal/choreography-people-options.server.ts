import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { dancers, professors } from "@/db/schema";
import type {
  ChoreographyDancerOption,
  ChoreographyProfessorOption,
} from "@/lib/portal/choreography-people.shared";

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
    .orderBy(asc(professors.firstName), asc(professors.lastName));

  return rows.filter(
    (professor) => professor.active || linkedProfessorIdsSet.has(professor.id),
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
    .orderBy(asc(dancers.firstName), asc(dancers.lastName));

  return rows.filter(
    (dancer) => dancer.active || linkedDancerIdsSet.has(dancer.id),
  );
}

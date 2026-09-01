import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  choreographyDancers,
  choreographyProfessors,
  dancers,
  professors,
} from "@/db/schema";
import { activeInscription } from "@/lib/choreographies/active-inscription";
import { findInscriptionsWithEvidence } from "@/lib/choreographies/inscription-withdrawal.server";

/**
 * The roster the admin edits is the active inscriptions. `hasEvidence` is the
 * only thing the form needs to know about the money: with evidence, removing
 * the dancer withdraws the inscription instead of deleting it, and the
 * confirmation dialog spells that out before the admin confirms.
 */
export async function listChoreographyDancers(choreographyId: string) {
  const rows = await db
    .select({
      active: dancers.active,
      ageAtEventStart: choreographyDancers.ageAtEventStart,
      firstName: dancers.firstName,
      id: dancers.id,
      inscriptionId: choreographyDancers.id,
      lastName: dancers.lastName,
    })
    .from(choreographyDancers)
    .innerJoin(dancers, eq(choreographyDancers.dancerId, dancers.id))
    .where(
      and(
        eq(choreographyDancers.choreographyId, choreographyId),
        activeInscription(),
      ),
    )
    .orderBy(asc(dancers.firstName), asc(dancers.lastName));
  const inscriptionsWithEvidence = await findInscriptionsWithEvidence(
    rows.map((row) => row.inscriptionId),
  );

  return rows.map(({ inscriptionId, ...row }) => ({
    ...row,
    hasEvidence: inscriptionsWithEvidence.has(inscriptionId),
  }));
}

export async function listChoreographyProfessors(choreographyId: string) {
  return await db
    .select({
      active: professors.active,
      firstName: professors.firstName,
      id: professors.id,
      lastName: professors.lastName,
    })
    .from(choreographyProfessors)
    .innerJoin(
      professors,
      eq(choreographyProfessors.professorId, professors.id),
    )
    .where(eq(choreographyProfessors.choreographyId, choreographyId))
    .orderBy(asc(professors.firstName), asc(professors.lastName));
}

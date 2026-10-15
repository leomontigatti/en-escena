/**
 * What an academy sees of the individuals linked to its people (ADR-0019): the
 * seminar inscriptions an individual made for itself, when its `Vinculado`
 * link reaches an **active** `dancer` or `professor` row of the academy. Only
 * that the person is registered reaches the academy: no amount, no payment,
 * nothing else of the individual's account. Which rows the link reaches is
 * read through the link module, which stays the privacy boundary.
 *
 * Callers add these rows beside their own from their loaders, never inside the
 * academy's finance summary, so its totals, its `Saldo disponible` and the
 * presets cannot count them.
 */

import { and, eq, inArray, isNull, type SQL } from "drizzle-orm";

import { db } from "@/db";
import {
  dancers,
  professors,
  seminarInscriptions,
  seminars,
} from "@/db/schema";
import { listRosterRowsLinkedIndividuals } from "@/lib/individuals/link.server";
import type { RosterPersonKind } from "@/lib/roster/roster-person-kind.shared";
import { activeRosterPerson } from "@/lib/roster/roster-person-status.server";

/**
 * One linked individual's inscription, named as the academy's own row names
 * the person: the academy reads its roster, not the individual's account.
 */
export type LinkedIndividualSeminarInscriptionRow = {
  firstName: string;
  inscriptionId: string;
  lastName: string;
  seminarId: string;
};

export async function readLinkedIndividualSeminarInscriptions(input: {
  academyId: string;
  eventId: string;
  seminarId?: string;
}): Promise<LinkedIndividualSeminarInscriptionRow[]> {
  const activeRows = await listActiveRosterRows(input.academyId);
  const links = await listRosterRowsLinkedIndividuals(activeRows);

  if (links.length === 0) {
    return [];
  }

  const conditions: SQL[] = [
    eq(seminars.eventId, input.eventId),
    inArray(
      seminarInscriptions.individualId,
      links.map((link) => link.individualId),
    ),
    isNull(seminarInscriptions.withdrawnAt),
  ];

  if (input.seminarId) {
    conditions.push(eq(seminarInscriptions.seminarId, input.seminarId));
  }

  const inscriptions = await db
    .select({
      individualId: seminarInscriptions.individualId,
      inscriptionId: seminarInscriptions.id,
      seminarId: seminarInscriptions.seminarId,
    })
    .from(seminarInscriptions)
    .innerJoin(seminars, eq(seminars.id, seminarInscriptions.seminarId))
    .where(and(...conditions));

  const rowsById = new Map(activeRows.map((row) => [row.id, row]));

  return inscriptions.flatMap((inscription) => {
    // A link can reach two rows of the academy, a dancer and a professor: the
    // first in roster order names the person, and the inscription reads once.
    const row = links
      .filter((link) => link.individualId === inscription.individualId)
      .map((link) => rowsById.get(link.rosterRowId))
      .find((candidate) => candidate !== undefined);

    return row
      ? [
          {
            firstName: row.firstName,
            inscriptionId: inscription.inscriptionId,
            lastName: row.lastName,
            seminarId: inscription.seminarId,
          },
        ]
      : [];
  });
}

type ActiveRosterRow = {
  firstName: string;
  id: string;
  kind: RosterPersonKind;
  lastName: string;
};

/** Dancers first, so a person on both lists is named as the dancer. */
async function listActiveRosterRows(
  academyId: string,
): Promise<ActiveRosterRow[]> {
  const [dancerRows, professorRows] = await Promise.all([
    db
      .select({
        firstName: dancers.firstName,
        id: dancers.id,
        lastName: dancers.lastName,
      })
      .from(dancers)
      .where(
        and(eq(dancers.academyId, academyId), activeRosterPerson(dancers)),
      ),
    db
      .select({
        firstName: professors.firstName,
        id: professors.id,
        lastName: professors.lastName,
      })
      .from(professors)
      .where(
        and(
          eq(professors.academyId, academyId),
          activeRosterPerson(professors),
        ),
      ),
  ]);

  return [
    ...dancerRows.map((row) => ({ ...row, kind: "dancer" as const })),
    ...professorRows.map((row) => ({ ...row, kind: "professor" as const })),
  ];
}

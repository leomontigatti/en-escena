/**
 * The seminar inscriptions a `Vinculado` link crosses (ADR-0019), in both
 * directions. Which rows a link reaches is read through the link module, which
 * stays the privacy boundary.
 *
 * - What an academy sees of the individuals linked to its people: the
 *   inscriptions an individual made for itself, when its link reaches an
 *   **active** `dancer` or `professor` row of the academy. Only that the person
 *   is registered reaches the academy: no amount, no payment, nothing else of
 *   the individual's account. Callers add these rows beside their own from
 *   their loaders, never inside the academy's finance summary, so its totals,
 *   its `Saldo disponible` and the presets cannot count them.
 * - What the individual sees of the academies: the inscriptions academies made
 *   for the rows its link reaches, which also refuse its own registration.
 */

import { and, asc, eq, inArray, or, type SQL } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  dancers,
  professors,
  seminarInscriptions,
  seminars,
} from "@/db/schema";
import {
  listIndividualsLinkedRosterRows,
  listRosterRowsLinkedIndividuals,
} from "@/lib/individuals/link.server";
import type { RosterPersonKind } from "@/lib/roster/roster-person-kind.shared";
import { seminarInscriptionPersonColumn } from "@/lib/roster/roster-person-kind.server";
import { activeRosterPerson } from "@/lib/roster/roster-person-status.server";
import { activeSeminarInscription } from "@/lib/seminars/active-inscription";
import { seminarInscriptionPerson } from "@/lib/seminars/inscription-person.server";

type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** An academy's inscription of a row the individual's link reaches. */
export type LinkedRowAcademyInscription = {
  academyName: string;
  id: string;
  seminarId: string;
};

/**
 * The academies' non-withdrawn inscriptions of the rows the individual's
 * `Vinculado` link reaches, whatever their `Estado de alta`, in one seminar or
 * in every seminar of one event, ordered by academy name. Without a confirmed
 * link the link reaches no row, so there are none. `executor` lets the
 * registration read it under the seminar's lock.
 */
export async function listLinkedRowsAcademySeminarInscriptions(
  input: { individualId: string } & (
    { eventId: string } | { seminarId: string }
  ),
  executor: Executor = db,
): Promise<LinkedRowAcademyInscription[]> {
  const links = await listIndividualsLinkedRosterRows(
    [input.individualId],
    executor,
  );

  if (links.length === 0) {
    return [];
  }

  return await executor
    .select({
      academyName: academies.name,
      id: seminarInscriptions.id,
      seminarId: seminarInscriptions.seminarId,
    })
    .from(seminarInscriptions)
    .innerJoin(seminars, eq(seminars.id, seminarInscriptions.seminarId))
    .innerJoin(
      seminarInscriptionPerson,
      eq(seminarInscriptionPerson.inscriptionId, seminarInscriptions.id),
    )
    .innerJoin(academies, eq(academies.id, seminarInscriptionPerson.academyId))
    .where(
      and(
        "eventId" in input
          ? eq(seminars.eventId, input.eventId)
          : eq(seminarInscriptions.seminarId, input.seminarId),
        activeSeminarInscription(),
        or(
          ...links.map((link) =>
            eq(
              seminarInscriptionPersonColumn(link.rosterRowKind),
              link.rosterRowId,
            ),
          ),
        ),
      ),
    )
    .orderBy(asc(academies.name), asc(seminarInscriptions.id));
}

/**
 * One linked individual's inscription, named as the academy's own row names
 * the person: the academy reads its roster, not the individual's account.
 */
export type LinkedIndividualSeminarInscriptionRow = {
  firstName: string;
  inscriptionId: string;
  /** The seminar's name and moment, so a seminar the academy registered
   * nobody in can still be listed. */
  instructorName: string;
  lastName: string;
  scheduledDate: string;
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
    activeSeminarInscription(),
  ];

  if (input.seminarId) {
    conditions.push(eq(seminarInscriptions.seminarId, input.seminarId));
  }

  const inscriptions = await db
    .select({
      individualId: seminarInscriptions.individualId,
      inscriptionId: seminarInscriptions.id,
      instructorName: seminars.instructorName,
      scheduledDate: seminars.scheduledDate,
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
            instructorName: inscription.instructorName,
            lastName: row.lastName,
            scheduledDate: inscription.scheduledDate,
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

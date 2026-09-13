/**
 * The roster readings of a seminar's inscriptions: administration's flat table,
 * the academy's own list across an event, and the people the academy may still
 * register. They are read-only and they are the write path's siblings rather
 * than its parts — `inscriptions.server.ts` decides who registers and who is
 * removed, this file answers who is on the roster.
 *
 * **Active rows only**, on every one of them: a withdrawn inscription is off the
 * roster and holds no place, and the money it retains is read on the finance
 * surfaces instead.
 */

import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  dancers,
  professors,
  seminarInscriptions,
  seminars,
} from "@/db/schema";
import {
  isSelectableForRoster,
  toRosterPersonStatus,
  type RosterPersonKind,
} from "@/lib/roster/roster-person-status.shared";
import { activeSeminarInscription } from "@/lib/seminars/active-inscription";
import { findSeminarInscriptionsWithEvidence } from "@/lib/seminars/inscription-withdrawal.server";

export type SeminarInscriptionListItem = {
  id: string;
  seminarId: string;
  personId: string;
  personKind: RosterPersonKind;
  fullName: string;
  academyId: string;
  createdAt: Date;
  /** Whether removing it withdraws the row instead of deleting it. */
  hasMoney: boolean;
};

/**
 * One row of the seminar detail's `Inscriptos` tab: who is registered, what
 * kind of roster person they are and which academy registered them. The academy
 * is read through the person, as it is everywhere else.
 */
export type SeminarInscriptionRow = {
  id: string;
  fullName: string;
  personKind: RosterPersonKind;
  academyName: string;
  /** Whether removing it withdraws the row instead of deleting it. The two
   * removal confirmations read it to say which of the two they are about to do
   * (`app/lib/seminars/inscription-withdrawal.server.ts`). */
  hasMoney: boolean;
};

export type SeminarPersonOption = {
  id: string;
  kind: RosterPersonKind;
  fullName: string;
};

/**
 * Every **active** inscription of one seminar, whichever academy made it.
 * Administration reads a flat table: there is no grouping and no occupancy line,
 * so the two halves are merged and sorted by academy, the order the table opens
 * in. A withdrawn row is off the roster and holds no place, so it is not listed
 * here; the money it retains is read on the finance surfaces instead.
 */
export async function listSeminarInscriptions(
  seminarId: string,
): Promise<SeminarInscriptionRow[]> {
  const [dancerRows, professorRows] = await Promise.all([
    db
      .select({
        id: seminarInscriptions.id,
        firstName: dancers.firstName,
        lastName: dancers.lastName,
        academyName: academies.name,
      })
      .from(seminarInscriptions)
      .innerJoin(dancers, eq(dancers.id, seminarInscriptions.dancerId))
      .innerJoin(academies, eq(academies.id, dancers.academyId))
      .where(
        and(
          eq(seminarInscriptions.seminarId, seminarId),
          activeSeminarInscription(),
        ),
      ),
    db
      .select({
        id: seminarInscriptions.id,
        firstName: professors.firstName,
        lastName: professors.lastName,
        academyName: academies.name,
      })
      .from(seminarInscriptions)
      .innerJoin(professors, eq(professors.id, seminarInscriptions.professorId))
      .innerJoin(academies, eq(academies.id, professors.academyId))
      .where(
        and(
          eq(seminarInscriptions.seminarId, seminarId),
          activeSeminarInscription(),
        ),
      ),
  ]);

  const rows = [
    ...dancerRows.map((row) => toInscriptionRow(row, "dancer")),
    ...professorRows.map((row) => toInscriptionRow(row, "professor")),
  ].sort(byAcademyThenFullName);

  return withEvidenceFlag(rows);
}

/**
 * The academy's own **active** inscriptions on an event's seminars, dancers and
 * professors in one list. The academy is read through the person, which is why
 * the two halves are queried separately and merged here.
 */
export async function listSeminarInscriptionsForAcademy(input: {
  academyId: string;
  eventId: string;
}): Promise<SeminarInscriptionListItem[]> {
  const eventSeminarIds = db
    .select({ id: seminars.id })
    .from(seminars)
    .where(eq(seminars.eventId, input.eventId));

  const [dancerRows, professorRows] = await Promise.all([
    db
      .select({
        id: seminarInscriptions.id,
        seminarId: seminarInscriptions.seminarId,
        personId: dancers.id,
        firstName: dancers.firstName,
        lastName: dancers.lastName,
        academyId: dancers.academyId,
        createdAt: seminarInscriptions.createdAt,
      })
      .from(seminarInscriptions)
      .innerJoin(dancers, eq(dancers.id, seminarInscriptions.dancerId))
      .where(
        and(
          eq(dancers.academyId, input.academyId),
          inArray(seminarInscriptions.seminarId, eventSeminarIds),
          activeSeminarInscription(),
        ),
      ),
    db
      .select({
        id: seminarInscriptions.id,
        seminarId: seminarInscriptions.seminarId,
        personId: professors.id,
        firstName: professors.firstName,
        lastName: professors.lastName,
        academyId: professors.academyId,
        createdAt: seminarInscriptions.createdAt,
      })
      .from(seminarInscriptions)
      .innerJoin(professors, eq(professors.id, seminarInscriptions.professorId))
      .where(
        and(
          eq(professors.academyId, input.academyId),
          inArray(seminarInscriptions.seminarId, eventSeminarIds),
          activeSeminarInscription(),
        ),
      ),
  ]);

  const rows = [
    ...dancerRows.map((row) => toInscriptionListItem(row, "dancer")),
    ...professorRows.map((row) => toInscriptionListItem(row, "professor")),
  ].sort(byFullName);

  return withEvidenceFlag(rows);
}

/**
 * Everyone the academy may still register: its active dancers and professors in
 * one flat list. An archived person is absent — the grandfather half of the
 * roster rule keeps the inscriptions they already have, and those are listed
 * from `listSeminarInscriptionsForAcademy`, not from here.
 */
export async function listSeminarPersonOptionsForAcademy(
  academyId: string,
): Promise<SeminarPersonOption[]> {
  const [dancerRows, professorRows] = await Promise.all([
    db
      .select({
        id: dancers.id,
        firstName: dancers.firstName,
        lastName: dancers.lastName,
        active: dancers.active,
      })
      .from(dancers)
      .where(eq(dancers.academyId, academyId))
      .orderBy(asc(sql`lower(${dancers.firstName})`)),
    db
      .select({
        id: professors.id,
        firstName: professors.firstName,
        lastName: professors.lastName,
        active: professors.active,
      })
      .from(professors)
      .where(eq(professors.academyId, academyId))
      .orderBy(asc(sql`lower(${professors.firstName})`)),
  ]);

  return [
    ...dancerRows
      .filter(isRegistrable)
      .map((row) => toPersonOption(row, "dancer")),
    ...professorRows
      .filter(isRegistrable)
      .map((row) => toPersonOption(row, "professor")),
  ].sort(byFullName);
}

// Nobody is linked yet from the picker's point of view: the people already on
// the seminar are subtracted by the caller, so what is left is the active half
// of the same rule the server enforces.
function isRegistrable(person: { active: boolean }) {
  return isSelectableForRoster({
    status: toRosterPersonStatus(person.active),
    isAlreadyLinked: false,
  });
}

/**
 * Marks the rows whose removal would withdraw them instead of deleting them.
 * The two roster readers answer it so that the confirmation each surface opens
 * can say which of the two it is about to do, and so that neither has to ask the
 * chooser a second question of its own.
 */
async function withEvidenceFlag<Row extends { hasMoney: boolean; id: string }>(
  rows: Row[],
): Promise<Row[]> {
  const evidence = await findSeminarInscriptionsWithEvidence(
    rows.map((row) => row.id),
  );

  return rows.map((row) => ({ ...row, hasMoney: evidence.has(row.id) }));
}

function toInscriptionListItem(
  row: {
    id: string;
    seminarId: string;
    personId: string;
    firstName: string;
    lastName: string;
    academyId: string;
    createdAt: Date;
  },
  personKind: RosterPersonKind,
): SeminarInscriptionListItem {
  return {
    id: row.id,
    seminarId: row.seminarId,
    personId: row.personId,
    personKind,
    fullName: `${row.firstName} ${row.lastName}`,
    academyId: row.academyId,
    createdAt: row.createdAt,
    hasMoney: false,
  };
}

function toPersonOption(
  row: { id: string; firstName: string; lastName: string },
  kind: RosterPersonKind,
): SeminarPersonOption {
  return {
    id: row.id,
    kind,
    fullName: `${row.firstName} ${row.lastName}`,
  };
}

function toInscriptionRow(
  row: {
    id: string;
    firstName: string;
    lastName: string;
    academyName: string;
  },
  personKind: RosterPersonKind,
): SeminarInscriptionRow {
  return {
    id: row.id,
    fullName: `${row.firstName} ${row.lastName}`,
    personKind,
    academyName: row.academyName,
    hasMoney: false,
  };
}

function byAcademyThenFullName(
  first: SeminarInscriptionRow,
  second: SeminarInscriptionRow,
) {
  return (
    first.academyName.localeCompare(second.academyName, "es-AR") ||
    byFullName(first, second)
  );
}

function byFullName(first: { fullName: string }, second: { fullName: string }) {
  return first.fullName.localeCompare(second.fullName, "es-AR");
}

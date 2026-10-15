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

import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { academies, seminarInscriptions, seminars } from "@/db/schema";
import { rosterPersonTable } from "@/lib/roster/roster-person-kind.server";
import {
  isSelectableForRoster,
  toRosterPersonStatus,
} from "@/lib/roster/roster-person-status.shared";
import {
  rosterPersonKinds,
  type RosterPersonKind,
} from "@/lib/roster/roster-person-kind.shared";
import { activeSeminarInscription } from "@/lib/seminars/active-inscription";
import {
  seminarInscriptionOwnedBy,
  seminarInscriptionPerson,
} from "@/lib/seminars/inscription-person.server";
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

/** The person columns of an inscription row; the academy is read through the
 * person, as it is everywhere else. */
const inscriptionPersonFields = {
  personId: seminarInscriptionPerson.personId,
  personKind: seminarInscriptionPerson.kind,
  firstName: seminarInscriptionPerson.firstName,
  lastName: seminarInscriptionPerson.lastName,
  academyId: seminarInscriptionPerson.academyId,
};

const joinsInscriptionPerson = eq(
  seminarInscriptionPerson.inscriptionId,
  seminarInscriptions.id,
);

/**
 * Every **active** inscription of one seminar, whichever academy made it.
 * Administration reads a flat table: there is no grouping and no occupancy line,
 * so the rows are sorted by academy, the order the table opens in. A withdrawn
 * row is off the roster and holds no place, so it is not listed here; the money
 * it retains is read on the finance surfaces instead.
 */
export async function listSeminarInscriptions(
  seminarId: string,
): Promise<SeminarInscriptionRow[]> {
  const rows = await db
    .select({
      ...inscriptionPersonFields,
      id: seminarInscriptions.id,
      academyName: academies.name,
    })
    .from(seminarInscriptions)
    .innerJoin(seminarInscriptionPerson, joinsInscriptionPerson)
    .innerJoin(academies, eq(academies.id, seminarInscriptionPerson.academyId))
    .where(
      and(
        eq(seminarInscriptions.seminarId, seminarId),
        activeSeminarInscription(),
      ),
    );

  return withEvidenceFlag(
    rows
      .map((row): SeminarInscriptionRow => ({
        id: row.id,
        fullName: `${row.firstName} ${row.lastName}`,
        personKind: row.personKind,
        academyName: row.academyName,
        hasMoney: false,
      }))
      .sort(byAcademyThenFullName),
  );
}

/**
 * The academy's own **active** inscriptions on an event's seminars, dancers and
 * professors in one list.
 */
export async function listSeminarInscriptionsForAcademy(input: {
  academyId: string;
  eventId: string;
}): Promise<SeminarInscriptionListItem[]> {
  const eventSeminarIds = db
    .select({ id: seminars.id })
    .from(seminars)
    .where(eq(seminars.eventId, input.eventId));
  const rows = await db
    .select({
      ...inscriptionPersonFields,
      id: seminarInscriptions.id,
      seminarId: seminarInscriptions.seminarId,
      createdAt: seminarInscriptions.createdAt,
    })
    .from(seminarInscriptions)
    .innerJoin(seminarInscriptionPerson, joinsInscriptionPerson)
    .where(
      and(
        seminarInscriptionOwnedBy(input.academyId),
        inArray(seminarInscriptions.seminarId, eventSeminarIds),
        activeSeminarInscription(),
      ),
    );

  return withEvidenceFlag(
    rows
      .map((row): SeminarInscriptionListItem => ({
        id: row.id,
        seminarId: row.seminarId,
        personId: row.personId,
        personKind: row.personKind,
        fullName: `${row.firstName} ${row.lastName}`,
        academyId: row.academyId,
        createdAt: row.createdAt,
        hasMoney: false,
      }))
      .sort(byFullName),
  );
}

/**
 * Everyone the academy may still register: its active dancers and professors in
 * one flat list. An archived person is absent — the grandfather half of the
 * roster rule keeps the inscriptions they already have, and those are listed
 * from `listSeminarInscriptionsForAcademy`, not from here. The two tables share
 * nothing to join on, so it stays one query per kind, mapped once.
 */
export async function listSeminarPersonOptionsForAcademy(
  academyId: string,
): Promise<SeminarPersonOption[]> {
  const optionsByKind = await Promise.all(
    rosterPersonKinds.map(async (kind) => {
      const table = rosterPersonTable(kind);
      const rows = await db
        .select({
          id: table.id,
          firstName: table.firstName,
          lastName: table.lastName,
          active: table.active,
        })
        .from(table)
        .where(eq(table.academyId, academyId));

      return rows.filter(isRegistrable).map((row): SeminarPersonOption => ({
        id: row.id,
        kind,
        fullName: `${row.firstName} ${row.lastName}`,
      }));
    }),
  );

  return optionsByKind.flat().sort(byFullName);
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

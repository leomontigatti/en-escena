import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import {
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
import {
  seminarFullMessage,
  seminarStartedMessage,
} from "@/lib/seminars/registration-refusals";
import { hasSeminarStarted } from "@/lib/seminars/registration-window";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type SeminarInscriptionListItem = {
  id: string;
  seminarId: string;
  personId: string;
  personKind: RosterPersonKind;
  fullName: string;
  academyId: string;
  createdAt: Date;
};

export type SeminarPersonOption = {
  id: string;
  kind: RosterPersonKind;
  fullName: string;
};

export type RegisterSeminarInscriptionInput = {
  academyId: string;
  eventId: string;
  now: Date;
  personId: string;
  personKind: RosterPersonKind;
  seminarId: string;
};

export type RegisterSeminarInscriptionFailureCode =
  | "already-registered"
  | "full"
  | "ineligible-person"
  | "seminar-not-found"
  | "started";

export type RegisterSeminarInscriptionResult =
  | { ok: true; inscriptionId: string }
  | {
      ok: false;
      code: RegisterSeminarInscriptionFailureCode;
      error: string;
    };

export const seminarInscriptionSuccessMessage = "Inscripción guardada.";

const ineligiblePersonMessage =
  "Elegí una persona activa del plantel de tu academia.";
const alreadyRegisteredMessage = "Esa persona ya está inscripta.";
const seminarNotFoundMessage = "No encontramos ese seminario.";

/**
 * The quota is a hard cap, so the count that decides it has to be taken under a
 * lock on the seminar row: `SELECT … FOR UPDATE` first, count second, insert
 * third. Two academies taking the last place at once are serialized by that
 * lock, and the loser reads the count the winner already wrote — the same
 * `full` refusal a plain attempt on a full seminar gets.
 */
export async function registerSeminarInscription(
  input: RegisterSeminarInscriptionInput,
): Promise<RegisterSeminarInscriptionResult> {
  return db.transaction(async (tx) => {
    const seminar = await lockSeminar(tx, input);

    // A seminar of another event is the same miss as one that is gone: the
    // portal only ever offers the active event's seminars.
    if (!seminar) {
      return failure("seminar-not-found", seminarNotFoundMessage);
    }

    return (
      (await findRegistrationRefusal(tx, seminar, input)) ??
      (await insertInscription(tx, seminar.id, input))
    );
  });
}

function lockSeminar(tx: Transaction, input: RegisterSeminarInscriptionInput) {
  return tx
    .select({
      id: seminars.id,
      quota: seminars.quota,
      scheduledDate: seminars.scheduledDate,
      startTime: seminars.startTime,
    })
    .from(seminars)
    .where(
      and(
        eq(seminars.id, input.seminarId),
        eq(seminars.eventId, input.eventId),
      ),
    )
    .for("update")
    .then((rows) => rows.at(0));
}

/** The three reasons a locked seminar refuses, in the order they are read. */
async function findRegistrationRefusal(
  tx: Transaction,
  seminar: {
    id: string;
    quota: number;
    scheduledDate: string;
    startTime: string;
  },
  input: RegisterSeminarInscriptionInput,
): Promise<RegisterSeminarInscriptionResult | null> {
  if (hasSeminarStarted(seminar, input.now)) {
    return failure("started", seminarStartedMessage);
  }

  if (!(await isPersonEligibleForSeminar(tx, input))) {
    return failure("ineligible-person", ineligiblePersonMessage);
  }

  const [countRow] = await tx
    .select({ inscriptionCount: sql<number>`count(*)` })
    .from(seminarInscriptions)
    .where(eq(seminarInscriptions.seminarId, seminar.id));

  if (Number(countRow?.inscriptionCount ?? 0) >= seminar.quota) {
    return failure("full", seminarFullMessage);
  }

  return null;
}

/**
 * The partial unique indexes are what actually forbid the same person twice, so
 * the refusal is read from the insert rather than from a check that another
 * transaction could invalidate a moment later.
 */
async function insertInscription(
  tx: Transaction,
  seminarId: string,
  input: RegisterSeminarInscriptionInput,
): Promise<RegisterSeminarInscriptionResult> {
  const [inserted] = await tx
    .insert(seminarInscriptions)
    .values({
      seminarId,
      dancerId: input.personKind === "dancer" ? input.personId : null,
      professorId: input.personKind === "professor" ? input.personId : null,
    })
    .onConflictDoNothing()
    .returning({ id: seminarInscriptions.id });

  if (!inserted) {
    return failure("already-registered", alreadyRegisteredMessage);
  }

  return { ok: true, inscriptionId: inserted.id };
}

/**
 * The academy's own inscriptions on an event's seminars, dancers and professors
 * in one list. The academy is read through the person, which is why the two
 * halves are queried separately and merged here.
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
        ),
      ),
  ]);

  return [
    ...dancerRows.map((row) => toInscriptionListItem(row, "dancer")),
    ...professorRows.map((row) => toInscriptionListItem(row, "professor")),
  ].sort(byFullName);
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

async function isPersonEligibleForSeminar(
  tx: Transaction,
  input: RegisterSeminarInscriptionInput,
) {
  const person = await findAcademyPerson(tx, input);

  if (!person) {
    return false;
  }

  // The choreography roster's rule, unchanged: active, or already on this
  // seminar. The second half never lets a new registration through — a person
  // already registered is refused by the unique index — but stating it here is
  // what keeps the seminar from growing a second eligibility rule.
  return isSelectableForRoster({
    status: toRosterPersonStatus(person.active),
    isAlreadyLinked: await isPersonRegistered(tx, input),
  });
}

async function findAcademyPerson(
  tx: Transaction,
  input: RegisterSeminarInscriptionInput,
) {
  if (input.personKind === "dancer") {
    const [dancer] = await tx
      .select({ active: dancers.active })
      .from(dancers)
      .where(
        and(
          eq(dancers.id, input.personId),
          eq(dancers.academyId, input.academyId),
        ),
      );

    return dancer;
  }

  const [professor] = await tx
    .select({ active: professors.active })
    .from(professors)
    .where(
      and(
        eq(professors.id, input.personId),
        eq(professors.academyId, input.academyId),
      ),
    );

  return professor;
}

async function isPersonRegistered(
  tx: Transaction,
  input: RegisterSeminarInscriptionInput,
) {
  const personColumn =
    input.personKind === "dancer"
      ? seminarInscriptions.dancerId
      : seminarInscriptions.professorId;
  const [existing] = await tx
    .select({ id: seminarInscriptions.id })
    .from(seminarInscriptions)
    .where(
      and(
        eq(seminarInscriptions.seminarId, input.seminarId),
        eq(personColumn, input.personId),
      ),
    );

  return existing !== undefined;
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

function byFullName(first: { fullName: string }, second: { fullName: string }) {
  return first.fullName.localeCompare(second.fullName, "es-AR");
}

function failure(
  code: RegisterSeminarInscriptionFailureCode,
  error: string,
): RegisterSeminarInscriptionResult {
  return { ok: false, code, error };
}

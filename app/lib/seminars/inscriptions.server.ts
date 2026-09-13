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

export type DeleteSeminarInscriptionInput = {
  academyId: string;
  eventId: string;
  inscriptionId: string;
  now: Date;
};

export type DeleteSeminarInscriptionFailureCode =
  | "inscription-not-found"
  | "started";

/** Administration's removal, which has no cut-off and no reason to refuse but
 * a row that is not there. */
export type RemoveSeminarInscriptionResult =
  | { ok: true }
  | { ok: false; code: "inscription-not-found"; error: string };

export type DeleteSeminarInscriptionResult =
  | { ok: true }
  | { ok: false; code: DeleteSeminarInscriptionFailureCode; error: string };

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
export const seminarInscriptionDeletedMessage = "Inscripción eliminada.";
export const seminarInscriptionNotFoundMessage =
  "No encontramos esa inscripción.";

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

/**
 * The three reasons a locked seminar refuses, in the order they are read.
 * Deliberately not the PRD's order, which lists the full seminar first: once a
 * seminar has begun its quota stopped being the question, so "started" wins —
 * the same precedence the portal footer reads a closed seminar by
 * (`getPortalSeminarClosedReason`). Eligibility comes before the count because
 * a person who could never be registered should not be told the seminar filled
 * up.
 */
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
 * The academy's own delete, open until the seminar starts. It is a physical
 * delete: the row carries no money and no history, so the place it held is free
 * the moment it is gone — a seminar that was refusing with `full` accepts the
 * next registration. An inscription of another academy or of another event is
 * not refused as forbidden but as missing: the portal never offers it, so
 * naming it back would only say that it exists.
 */
export async function deleteSeminarInscriptionForAcademy(
  input: DeleteSeminarInscriptionInput,
): Promise<DeleteSeminarInscriptionResult> {
  const inscription = await findAcademyInscription(input);

  if (!inscription) {
    return deletionFailure(
      "inscription-not-found",
      seminarInscriptionNotFoundMessage,
    );
  }

  if (hasSeminarStarted(inscription, input.now)) {
    return deletionFailure("started", seminarStartedMessage);
  }

  await db
    .delete(seminarInscriptions)
    .where(eq(seminarInscriptions.id, input.inscriptionId));

  return { ok: true };
}

/**
 * The owning academy is read through the person, as it is everywhere else: the
 * inscription stores no academy of its own, so both roster tables are joined
 * and whichever half is filled answers.
 */
async function findAcademyInscription(input: DeleteSeminarInscriptionInput) {
  const [row] = await db
    .select({
      academyId: sql<
        string | null
      >`coalesce(${dancers.academyId}, ${professors.academyId})`,
      scheduledDate: seminars.scheduledDate,
      startTime: seminars.startTime,
    })
    .from(seminarInscriptions)
    .innerJoin(seminars, eq(seminars.id, seminarInscriptions.seminarId))
    .leftJoin(dancers, eq(dancers.id, seminarInscriptions.dancerId))
    .leftJoin(professors, eq(professors.id, seminarInscriptions.professorId))
    .where(
      and(
        eq(seminarInscriptions.id, input.inscriptionId),
        eq(seminars.eventId, input.eventId),
      ),
    );

  return row?.academyId === input.academyId ? row : undefined;
}

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

  return [
    ...dancerRows.map((row) => toInscriptionRow(row, "dancer")),
    ...professorRows.map((row) => toInscriptionRow(row, "professor")),
  ].sort(byAcademyThenFullName);
}

/**
 * Administration's removal: no cut-off, no reason and no trail. A seminar that
 * has already started is removed from all the same, because this is the release
 * valve for the two guards on the seminar itself — a seminar with inscriptions
 * cannot be deleted, and its quota cannot drop below the count.
 */
export async function removeSeminarInscription(input: {
  inscriptionId: string;
  seminarId: string;
}): Promise<RemoveSeminarInscriptionResult> {
  const [deleted] = await db
    .delete(seminarInscriptions)
    .where(
      and(
        eq(seminarInscriptions.id, input.inscriptionId),
        eq(seminarInscriptions.seminarId, input.seminarId),
      ),
    )
    .returning({ id: seminarInscriptions.id });

  if (!deleted) {
    return {
      ok: false,
      code: "inscription-not-found",
      error: seminarInscriptionNotFoundMessage,
    };
  }

  return { ok: true };
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

function deletionFailure(
  code: DeleteSeminarInscriptionFailureCode,
  error: string,
): DeleteSeminarInscriptionResult {
  return { ok: false, code, error };
}

function failure(
  code: RegisterSeminarInscriptionFailureCode,
  error: string,
): RegisterSeminarInscriptionResult {
  return { ok: false, code, error };
}

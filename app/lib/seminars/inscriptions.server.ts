import { and, eq, sql } from "drizzle-orm";

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
import { activeSeminarInscription } from "@/lib/seminars/active-inscription";
import {
  countCoveredSeminarInscriptions,
  holdsCoveredDeposit,
} from "@/lib/seminars/covered-inscriptions.server";
import {
  removeSeminarInscriptionFromRoster,
  reviveWithdrawnSeminarInscription,
} from "@/lib/seminars/inscription-withdrawal.server";
import {
  seminarNoPlacesForRevivalMessage,
  seminarStartedMessage,
} from "@/lib/seminars/registration-refusals";
import { hasSeminarStarted } from "@/lib/seminars/registration-window";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The seminar row the registration path holds a lock on while it decides. */
type LockedSeminar = {
  id: string;
  quota: number;
  scheduledDate: string;
  startTime: string;
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
  | { ok: true; withdrawn: boolean }
  | { ok: false; code: "inscription-not-found"; error: string };

export type DeleteSeminarInscriptionResult =
  | { ok: true; withdrawn: boolean }
  | { ok: false; code: DeleteSeminarInscriptionFailureCode; error: string };

export type RegisterSeminarInscriptionFailureCode =
  | "already-registered"
  | "ineligible-person"
  | "no-places"
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
/** Said instead when the row held money or a comprobante line: what happened is
 * not a deletion, and the surface that asked must not report one. */
export const seminarInscriptionWithdrawnMessage = "Inscripción retirada.";
export const seminarInscriptionNotFoundMessage =
  "No encontramos esa inscripción.";

const ineligiblePersonMessage =
  "Elegí una persona activa del plantel de tu academia.";
const alreadyRegisteredMessage = "Esa persona ya está inscripta.";
const seminarNotFoundMessage = "No encontramos ese seminario.";

/**
 * **Registration is unlimited.** The quota is not a cap on inscriptions: a place
 * is taken by covering the deposit, which is a decision of the allocation path
 * (`app/lib/finances/seminar-inscription-allocation.server.ts`), so an academy
 * registers whoever it wants and then decides who to pay for
 * (docs/domain/seminars.md, "The place").
 *
 * The row lock on the seminar stays all the same: the start time and the
 * eligibility are read off it, and holding it keeps a registration from racing
 * the seminar's own edits.
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
      (await insertOrReviveInscription(tx, seminar, input))
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
 * The two reasons a locked seminar refuses, in the order they are read: a
 * seminar that has begun takes nobody, and a person who is not on the academy's
 * active roster is nobody it may register. How full the seminar is is not among
 * them.
 */
async function findRegistrationRefusal(
  tx: Transaction,
  seminar: LockedSeminar,
  input: RegisterSeminarInscriptionInput,
): Promise<RegisterSeminarInscriptionResult | null> {
  if (hasSeminarStarted(seminar, input.now)) {
    return failure("started", seminarStartedMessage);
  }

  if (!(await isPersonEligibleForSeminar(tx, input))) {
    return failure("ineligible-person", ineligiblePersonMessage);
  }

  return null;
}

/**
 * Registering somebody who already holds a **withdrawn** row brings that row
 * back rather than inserting a second one: the id survives, and with it the
 * money the withdrawal retained, the price row it stored and the `createdAt`
 * that dates the inscription.
 *
 * The revival is a registration in every other respect — it happens under the
 * seminar's lock, from the portal, for an active person, until the seminar
 * starts — and it is the one registration the quota can refuse: a row still
 * holding money past its stored deposit takes its place back the moment it is
 * active again, so a seminar whose covered rows already fill the quota refuses
 * it and leaves the row withdrawn.
 */
async function insertOrReviveInscription(
  tx: Transaction,
  seminar: LockedSeminar,
  input: RegisterSeminarInscriptionInput,
): Promise<RegisterSeminarInscriptionResult> {
  const existing = await findPersonInscription(tx, input);

  if (existing) {
    return existing.withdrawnAt === null
      ? failure("already-registered", alreadyRegisteredMessage)
      : await reviveInscription(tx, seminar, existing.id);
  }

  // The partial unique indexes are what actually forbid the same person twice,
  // so a row that appeared after the read above is refused by the insert rather
  // than by a check another transaction could invalidate a moment later.
  const [inserted] = await tx
    .insert(seminarInscriptions)
    .values({
      seminarId: seminar.id,
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

async function reviveInscription(
  tx: Transaction,
  seminar: LockedSeminar,
  inscriptionId: string,
): Promise<RegisterSeminarInscriptionResult> {
  // The row is still withdrawn while this is read, so the covered count cannot
  // see it and needs no exception for it.
  if (await holdsCoveredDeposit(inscriptionId, tx)) {
    const coveredCount = await countCoveredSeminarInscriptions(seminar.id, tx);

    if (coveredCount >= seminar.quota) {
      return failure("no-places", seminarNoPlacesForRevivalMessage);
    }
  }

  await reviveWithdrawnSeminarInscription(tx, inscriptionId);

  return { ok: true, inscriptionId };
}

/** The person's row on this seminar, withdrawn or not: the one read that tells
 * a registration from a revival. */
async function findPersonInscription(
  tx: Transaction,
  input: RegisterSeminarInscriptionInput,
) {
  const [row] = await tx
    .select({
      id: seminarInscriptions.id,
      withdrawnAt: seminarInscriptions.withdrawnAt,
    })
    .from(seminarInscriptions)
    .where(
      and(
        eq(seminarInscriptions.seminarId, input.seminarId),
        eq(personColumn(input.personKind), input.personId),
      ),
    );

  return row;
}

function personColumn(personKind: RosterPersonKind) {
  return personKind === "dancer"
    ? seminarInscriptions.dancerId
    : seminarInscriptions.professorId;
}

/**
 * The academy's own removal, open until the seminar starts. Whether it deletes
 * the row or withdraws it is not decided here: the chooser reads the evidence
 * and answers (`inscription-withdrawal.server.ts`). A withdrawal keeps the money
 * on the row and frees its place all the same, which is what lets the academy
 * change its mind about somebody it already paid for.
 *
 * An inscription of another academy or of another event is not refused as
 * forbidden but as missing: the portal never offers it, so naming it back would
 * only say that it exists.
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

  return {
    ok: true,
    ...(await removeSeminarInscriptionFromRoster(db, input.inscriptionId)),
  };
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
        // A row already withdrawn is off the roster: the portal does not list
        // it, so removing it again is the same miss as removing one that is
        // gone.
        activeSeminarInscription(),
      ),
    );

  return row?.academyId === input.academyId ? row : undefined;
}

/**
 * Administration's removal: no cut-off, no reason and no trail. A seminar that
 * has already started is removed from all the same, because this is the release
 * valve for the guards on the seminar itself — a seminar with inscriptions
 * cannot be deleted, and its quota cannot drop below the covered count.
 *
 * It goes through the same chooser the academy's removal does: what differs
 * between the two sides is who may ask and until when, never what happens to
 * the money.
 */
export async function removeSeminarInscription(input: {
  inscriptionId: string;
  seminarId: string;
}): Promise<RemoveSeminarInscriptionResult> {
  const [existing] = await db
    .select({ id: seminarInscriptions.id })
    .from(seminarInscriptions)
    .where(
      and(
        eq(seminarInscriptions.id, input.inscriptionId),
        eq(seminarInscriptions.seminarId, input.seminarId),
        activeSeminarInscription(),
      ),
    );

  if (!existing) {
    return {
      ok: false,
      code: "inscription-not-found",
      error: seminarInscriptionNotFoundMessage,
    };
  }

  return {
    ok: true,
    ...(await removeSeminarInscriptionFromRoster(db, input.inscriptionId)),
  };
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

/**
 * Active rows only, which is what makes a **revival** the registration of an
 * active person: an archived person holding a withdrawn row is not grandfathered
 * back in by the row they no longer have.
 */
async function isPersonRegistered(
  tx: Transaction,
  input: RegisterSeminarInscriptionInput,
) {
  const [existing] = await tx
    .select({ id: seminarInscriptions.id })
    .from(seminarInscriptions)
    .where(
      and(
        eq(seminarInscriptions.seminarId, input.seminarId),
        eq(personColumn(input.personKind), input.personId),
        activeSeminarInscription(),
      ),
    );

  return existing !== undefined;
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

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { individuals, seminarInscriptions, seminars } from "@/db/schema";
import {
  isSelectableForRoster,
  toRosterPersonStatus,
} from "@/lib/roster/roster-person-status.shared";
import type { InscriptionPersonKind } from "@/lib/roster/roster-person-kind.shared";
import {
  rosterPersonTable,
  seminarInscriptionPersonColumn,
  seminarInscriptionPersonValues,
} from "@/lib/roster/roster-person-kind.server";
import { activeSeminarInscription } from "@/lib/seminars/active-inscription";
import {
  countTakenSeminarPlaces,
  readSeminarPlaces,
} from "@/lib/seminars/covered-inscriptions.server";
import { removeSeminarInscriptionFromRoster } from "@/lib/seminars/inscription-withdrawal.server";
import {
  findLinkedPersonRefusal,
  type LinkedPersonRefusalCode,
} from "@/lib/seminars/linked-person-refusals.server";
import { seminarStartedMessage } from "@/lib/seminars/registration-refusals";
import { hasSeminarStarted } from "@/lib/seminars/registration-window";
import { getSeminarReservationEndsAt } from "@/lib/seminars/seminar-reservations";
import { seminarInscriptionPerson } from "@/lib/seminars/inscription-person.server";

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
  /** A roster person of the academy, or the individual its owner row is
   * (ADR-0019): `academyId` is then the individual's owner row. */
  personKind: InscriptionPersonKind;
  seminarId: string;
};

export type DeleteSeminarInscriptionInput = {
  academyId: string;
  eventId: string;
  inscriptionId: string;
  now: Date;
};

export type DeleteSeminarInscriptionFailureCode =
  "inscription-not-found" | "started";

/** Administration's removal, which has no cut-off and no reason to refuse but
 * a row that is not there. */
export type RemoveSeminarInscriptionResult =
  | { ok: true; withdrawn: boolean }
  | { ok: false; code: "inscription-not-found"; error: string };

export type DeleteSeminarInscriptionResult =
  | { ok: true; withdrawn: boolean }
  | { ok: false; code: DeleteSeminarInscriptionFailureCode; error: string };

export type RegisterSeminarInscriptionFailureCode =
  | LinkedPersonRefusalCode
  | "already-registered"
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
/** Said instead when the row held money or a comprobante line: what happened is
 * not a deletion, and the surface that asked must not report one. */
export const seminarInscriptionWithdrawnMessage = "Inscripción retirada.";
export const seminarInscriptionNotFoundMessage =
  "No encontramos esa inscripción.";

const ineligiblePersonMessage =
  "Elegí una persona activa del plantel de tu academia.";
const alreadyRegisteredMessage = "Esa persona ya está inscripta.";
/** The individual registers itself, so the refusal speaks to it. */
const individualAlreadyRegisteredMessage =
  "Ya estás inscripto en este seminario.";
const seminarNotFoundMessage = "No encontramos ese seminario.";

/**
 * **Registration is unlimited.** The quota is not a cap on inscriptions: a new
 * row reserves a place for `SEMINAR_RESERVATION_HOURS` when one is free
 * (`reserveIfPlaceFree`), and a place is kept by covering the deposit, which is a decision of the allocation path
 * (`app/lib/finances/seminar-inscription-allocation.server.ts`). An academy
 * registers whoever it wants, into a full seminar too
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
      (await insertInscription(tx, seminar, input))
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
 * The reasons a locked seminar refuses, in the order they are read: a seminar
 * that has begun takes nobody, a person who is not on the academy's active
 * roster is nobody it may register, and a person the other side already
 * registered through a confirmed link is not registered twice
 * (`findLinkedPersonRefusal`). How full the seminar is is not among them.
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

  const linkedRefusal = await findLinkedPersonRefusal(tx, input);

  return linkedRefusal ? { ok: false, ...linkedRefusal } : null;
}

/**
 * Every registration inserts a row, including the person's registration after a
 * withdrawal: a withdrawal is final, so the withdrawn row stays as the record of
 * the drop, with the money it retained, and the new row starts with none.
 *
 * The partial unique indexes count only the rows on the roster, and they are
 * what actually forbid the same person twice: a row that appears concurrently
 * is refused by the insert rather than by a check another transaction could
 * invalidate a moment later.
 */
async function insertInscription(
  tx: Transaction,
  seminar: LockedSeminar,
  input: RegisterSeminarInscriptionInput,
): Promise<RegisterSeminarInscriptionResult> {
  const [inserted] = await tx
    .insert(seminarInscriptions)
    .values({
      reservedUntil: await reserveIfPlaceFree(tx, seminar, input.now),
      seminarId: seminar.id,
      ...seminarInscriptionPersonValues({
        kind: input.personKind,
        personId: input.personId,
      }),
    })
    .onConflictDoNothing()
    .returning({ id: seminarInscriptions.id });

  if (!inserted) {
    return failure(
      "already-registered",
      input.personKind === "individual"
        ? individualAlreadyRegisteredMessage
        : alreadyRegisteredMessage,
    );
  }

  return { ok: true, inscriptionId: inserted.id };
}

/**
 * A new row reserves a place only when the seminar has one nobody holds, read
 * under the seminar's lock so two registrations cannot both take the last one.
 * A registration into a full seminar stores no reservation and never gains one
 * later: it holds a place only by covering its deposit.
 */
async function reserveIfPlaceFree(
  tx: Transaction,
  seminar: LockedSeminar,
  now: Date,
): Promise<Date | null> {
  const places = (await readSeminarPlaces([seminar.id], now, tx)).get(
    seminar.id,
  );

  return countTakenSeminarPlaces(places) < seminar.quota
    ? getSeminarReservationEndsAt(seminar, now)
    : null;
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
 * inscription stores no academy of its own. An individual's owner row owns the
 * individual's inscriptions, so its removal is this same path.
 */
async function findAcademyInscription(input: DeleteSeminarInscriptionInput) {
  const [row] = await db
    .select({
      academyId: seminarInscriptionPerson.academyId,
      scheduledDate: seminars.scheduledDate,
      startTime: seminars.startTime,
    })
    .from(seminarInscriptions)
    .innerJoin(seminars, eq(seminars.id, seminarInscriptions.seminarId))
    .innerJoin(
      seminarInscriptionPerson,
      eq(seminarInscriptionPerson.inscriptionId, seminarInscriptions.id),
    )
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

/**
 * The person, read only within the registering owner: a roster person of the
 * academy, or the individual whose owner row is registering it. An individual
 * has no `Estado de alta`, so it is always active.
 */
async function findAcademyPerson(
  tx: Transaction,
  input: RegisterSeminarInscriptionInput,
): Promise<{ active: boolean } | undefined> {
  if (input.personKind === "individual") {
    const [individual] = await tx
      .select({ id: individuals.id })
      .from(individuals)
      .where(
        and(
          eq(individuals.id, input.personId),
          eq(individuals.academyId, input.academyId),
        ),
      );

    return individual ? { active: true } : undefined;
  }

  const table = rosterPersonTable(input.personKind);
  const [person] = await tx
    .select({ active: table.active })
    .from(table)
    .where(
      and(eq(table.id, input.personId), eq(table.academyId, input.academyId)),
    );

  return person;
}

/**
 * Active rows only: an archived person holding a withdrawn row is not
 * grandfathered back in by the row they no longer have, so registering them
 * again is registering an archived person.
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
        eq(seminarInscriptionPersonColumn(input.personKind), input.personId),
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

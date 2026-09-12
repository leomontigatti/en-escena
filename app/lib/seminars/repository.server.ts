import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";

import { db } from "@/db";
import { seminarInscriptions, seminars } from "@/db/schema";
import { hasCoveredSeminarInscription } from "@/lib/seminars/covered-inscriptions.server";
import {
  invalidSeminarDepositPercentageMessage,
  isValidSeminarDepositPercentage,
} from "@/lib/seminars/deposit-percentage";
import { isSeminarKind, type SeminarKind } from "@/lib/seminars/seminar-kinds";
import { seminarHasInscriptionsMessage } from "@/lib/seminars/registration-refusals";
import { isDateOnly } from "@/lib/shared/date-only";

export type SeminarRow = typeof seminars.$inferSelect;

/**
 * `db` or an open transaction. The quota floor has to count under the same lock
 * the registration path takes, so the count query is written once and told
 * which of the two to run on.
 */
type SeminarExecutor =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * A seminar as every surface reads it: the row plus how many places are left,
 * the quota minus the inscriptions already taken. It is a reading, never a
 * decision: the quota is enforced under a lock when an inscription is written
 * (`app/lib/seminars/inscriptions.server.ts`).
 */
export type SeminarListItem = SeminarRow & {
  availablePlaces: number;
  /** How many places the quota has already given away. */
  inscriptionCount: number;
};

export type SeminarInput = {
  instructorName: string;
  scheduledDate: string;
  startTime: string;
  quota: number;
  kind: SeminarKind;
  requiredDepositPercentage: number;
};

export type SeminarFieldName =
  | "instructorName"
  | "scheduledDate"
  | "startTime"
  | "quota"
  | "kind"
  | "requiredDepositPercentage";

export type SeminarFailure = {
  ok: false;
  code:
    | "invalid-seminar"
    | "duplicate-seminar"
    | "has-inscriptions"
    | "covered-inscriptions"
    | "quota-below-count"
    | "seminar-not-found";
  error: string;
  fieldErrors?: Partial<Record<SeminarFieldName, string>>;
};

export type SeminarMutationResult =
  | { ok: true; seminar: SeminarRow }
  | SeminarFailure;

export type SeminarDeleteResult = { ok: true } | SeminarFailure;

const invalidSeminarError = "Revisá los datos del seminario.";
const duplicateSeminarError =
  "Ya existe un seminario de ese instructor en esa fecha y hora.";
const duplicateSeminarFieldError =
  "Cambiá el instructor, la fecha o la hora del seminario.";
const seminarNotFoundError = "No encontramos ese seminario.";
const requiredSeminarFieldError = "Este campo es obligatorio.";
const coveredSeminarError =
  "No se puede cambiar el tipo de seminario ni la seña: ya hay inscripciones con la seña cubierta.";

export async function listSeminars(
  eventId: string,
): Promise<SeminarListItem[]> {
  const eventSeminars = await db.query.seminars.findMany({
    where: eq(seminars.eventId, eventId),
    orderBy: [
      asc(seminars.scheduledDate),
      asc(seminars.startTime),
      asc(seminars.instructorName),
    ],
  });
  const inscriptionCounts = await countInscriptionsBySeminar(
    eventSeminars.map((seminar) => seminar.id),
  );

  return eventSeminars.map((seminar) =>
    toSeminarListItem(seminar, inscriptionCounts.get(seminar.id) ?? 0),
  );
}

export async function getSeminar(
  seminarId: string,
): Promise<SeminarListItem | null> {
  const seminar = await db.query.seminars.findFirst({
    where: eq(seminars.id, seminarId),
  });

  if (!seminar) {
    return null;
  }

  const inscriptionCounts = await countInscriptionsBySeminar([seminar.id]);

  return toSeminarListItem(seminar, inscriptionCounts.get(seminar.id) ?? 0);
}

/**
 * One query for the whole list, so a gallery of seminars does not become one
 * count per card.
 */
async function countInscriptionsBySeminar(
  seminarIds: string[],
  executor: SeminarExecutor = db,
) {
  if (seminarIds.length === 0) {
    return new Map<string, number>();
  }

  const rows = await executor
    .select({
      seminarId: seminarInscriptions.seminarId,
      inscriptionCount: sql<number>`count(*)`,
    })
    .from(seminarInscriptions)
    .where(inArray(seminarInscriptions.seminarId, seminarIds))
    .groupBy(seminarInscriptions.seminarId);

  return new Map(
    rows.map((row) => [row.seminarId, Number(row.inscriptionCount)]),
  );
}

async function countSeminarInscriptions(
  seminarId: string,
  executor: SeminarExecutor = db,
) {
  const counts = await countInscriptionsBySeminar([seminarId], executor);

  return counts.get(seminarId) ?? 0;
}

function toSeminarListItem(
  seminar: SeminarRow,
  inscriptionCount: number,
): SeminarListItem {
  return {
    ...seminar,
    availablePlaces: Math.max(seminar.quota - inscriptionCount, 0),
    inscriptionCount,
  };
}

export async function createSeminar(
  eventId: string,
  input: SeminarInput,
): Promise<SeminarMutationResult> {
  const validation = validateSeminarInput(input);

  if (!validation.ok) {
    return validation;
  }

  const duplicate = await findConflictingSeminar(eventId, validation.input);

  if (duplicate) {
    return duplicateSeminarFailure();
  }

  const [seminar] = await db
    .insert(seminars)
    .values({ eventId, ...validation.input })
    .returning();

  if (!seminar) {
    return {
      ok: false,
      code: "invalid-seminar",
      error: "No se pudo guardar el seminario.",
    };
  }

  return { ok: true, seminar };
}

export async function updateSeminar(
  seminarId: string,
  input: SeminarInput,
): Promise<SeminarMutationResult> {
  const validation = validateSeminarInput(input);

  if (!validation.ok) {
    return validation;
  }

  // The whole read-decide-write runs under a lock on the seminar row, the same
  // one `registerSeminarInscription` takes. Counting outside it would let a
  // registration land between the count and the update and leave the seminar
  // holding more inscriptions than its new quota describes.
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        eventId: seminars.eventId,
        kind: seminars.kind,
        requiredDepositPercentage: seminars.requiredDepositPercentage,
      })
      .from(seminars)
      .where(eq(seminars.id, seminarId))
      .for("update");

    if (!existing) {
      return seminarNotFoundFailure();
    }

    const duplicate = await findConflictingSeminar(
      existing.eventId,
      validation.input,
      seminarId,
      tx,
    );

    if (duplicate) {
      return duplicateSeminarFailure();
    }

    // The kind and the deposit rate are structural once money depends on them:
    // both feed the deposit an inscription had to cover to take its place, and
    // a covered row cannot have that threshold moved under it.
    const structuralChange =
      existing.kind !== validation.input.kind ||
      existing.requiredDepositPercentage !==
        validation.input.requiredDepositPercentage;

    if (
      structuralChange &&
      (await hasCoveredSeminarInscription(seminarId, tx))
    ) {
      return {
        ok: false,
        code: "covered-inscriptions",
        error: coveredSeminarError,
      };
    }

    // The quota can never describe fewer places than the seminar already gave
    // away: administration removes an inscription first, which is the only way
    // the floor moves down.
    const inscriptionCount = await countSeminarInscriptions(seminarId, tx);

    if (validation.input.quota < inscriptionCount) {
      return {
        ok: false,
        code: "quota-below-count",
        error: `No se puede bajar el cupo a menos de ${inscriptionCount}: es la cantidad de inscriptos.`,
      };
    }

    const [seminar] = await tx
      .update(seminars)
      .set(validation.input)
      .where(eq(seminars.id, seminarId))
      .returning();

    if (!seminar) {
      return seminarNotFoundFailure();
    }

    return { ok: true, seminar };
  });
}

/**
 * The row holds the storage key of the instructor's picture, never a URL, and
 * the object is written or removed before this is called: the key is the last
 * thing to change, so a seminar never points at bytes that are not there.
 */
export async function setSeminarInstructorPicture(
  seminarId: string,
  instructorPictureStorageKey: string | null,
): Promise<void> {
  await db
    .update(seminars)
    .set({ instructorPictureStorageKey })
    .where(eq(seminars.id, seminarId));
}

/**
 * The seminar's foreign key cascades, so nothing but this guard keeps a delete
 * from taking the inscriptions with it. Administration removes them one by one
 * first — that removal is the release valve, and there is no override.
 */
export async function deleteSeminar(
  seminarId: string,
): Promise<SeminarDeleteResult> {
  // Under the same lock the registration path takes: the foreign key cascades,
  // so counting outside it would let an inscription land between the guard and
  // the delete and be taken with the seminar without ever being refused.
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: seminars.id })
      .from(seminars)
      .where(eq(seminars.id, seminarId))
      .for("update");

    if (!existing) {
      return seminarNotFoundFailure();
    }

    if ((await countSeminarInscriptions(seminarId, tx)) > 0) {
      return {
        ok: false,
        code: "has-inscriptions",
        error: seminarHasInscriptionsMessage,
      };
    }

    await tx.delete(seminars).where(eq(seminars.id, seminarId));

    return { ok: true };
  });
}

/**
 * The unique index is on the stored columns, so the check that reports the
 * refusal as a field error compares the same normalized values the insert is
 * about to write.
 */
async function findConflictingSeminar(
  eventId: string,
  input: SeminarInput,
  exceptSeminarId?: string,
  executor: SeminarExecutor = db,
) {
  const filters = [
    eq(seminars.eventId, eventId),
    eq(seminars.instructorName, input.instructorName),
    eq(seminars.scheduledDate, input.scheduledDate),
    eq(seminars.startTime, input.startTime),
    exceptSeminarId ? ne(seminars.id, exceptSeminarId) : undefined,
  ].filter(Boolean);

  const [conflicting] = await executor
    .select({ id: seminars.id })
    .from(seminars)
    .where(and(...filters))
    .limit(1);

  return conflicting;
}

function validateSeminarInput(
  input: SeminarInput,
): { ok: true; input: SeminarInput } | SeminarFailure {
  const instructorName = input.instructorName.trim();
  const scheduledDate = input.scheduledDate.trim();
  const startTime = input.startTime.trim().slice(0, 5);
  const fieldErrors: Partial<Record<SeminarFieldName, string>> = {};

  if (instructorName.length === 0) {
    fieldErrors.instructorName = "Ingresá el nombre del instructor.";
  }

  if (!isDateOnly(scheduledDate)) {
    fieldErrors.scheduledDate = requiredSeminarFieldError;
  }

  if (!isTimeOnly(startTime)) {
    fieldErrors.startTime = requiredSeminarFieldError;
  }

  if (!Number.isInteger(input.quota) || input.quota < 1) {
    fieldErrors.quota = "Ingresá un cupo mayor a cero.";
  }

  if (!isSeminarKind(input.kind)) {
    fieldErrors.kind = requiredSeminarFieldError;
  }

  if (!isValidSeminarDepositPercentage(input.requiredDepositPercentage)) {
    fieldErrors.requiredDepositPercentage =
      invalidSeminarDepositPercentageMessage;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      code: "invalid-seminar",
      error: invalidSeminarError,
      fieldErrors,
    };
  }

  return {
    ok: true,
    input: {
      instructorName,
      scheduledDate,
      startTime,
      quota: input.quota,
      kind: input.kind,
      requiredDepositPercentage: input.requiredDepositPercentage,
    },
  };
}

function isTimeOnly(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function duplicateSeminarFailure(): SeminarFailure {
  return {
    ok: false,
    code: "duplicate-seminar",
    error: duplicateSeminarError,
    fieldErrors: { instructorName: duplicateSeminarFieldError },
  };
}

function seminarNotFoundFailure(): SeminarFailure {
  return {
    ok: false,
    code: "seminar-not-found",
    error: seminarNotFoundError,
  };
}

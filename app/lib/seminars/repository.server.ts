import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";

import { db } from "@/db";
import { seminarInscriptions, seminars } from "@/db/schema";
import { activeSeminarInscription } from "@/lib/seminars/active-inscription";
import {
  countCoveredSeminarInscriptions,
  countCoveredSeminarInscriptionsBySeminar,
  hasCoveredSeminarInscription,
} from "@/lib/seminars/covered-inscriptions.server";
import {
  invalidSeminarDepositPercentageMessage,
  isValidSeminarDepositPercentage,
} from "@/lib/seminars/deposit-percentage";
import { isSeminarKind, type SeminarKind } from "@/lib/seminars/seminar-kinds";
import { seminarHasComprobantes } from "@/lib/comprobantes/comprobantes.server";
import {
  seminarHasComprobantesMessage,
  seminarHasInscriptionsMessage,
} from "@/lib/seminars/registration-refusals";
import { isDateOnly } from "@/lib/shared/date-only";

export type SeminarRow = typeof seminars.$inferSelect;

/**
 * `db` or an open transaction. The counts feed decisions taken under a lock on
 * the seminar row, so the queries are written once and told which of the two to
 * run on.
 */
type SeminarExecutor =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * A seminar as every surface reads it: the row plus the two counts that are not
 * the same question.
 *
 * **A place is taken by covering the deposit**, so `availablePlaces` is the
 * quota minus the *covered* inscriptions, while `registeredCount` is how many
 * people are on the roster whether they paid or not — registration is unlimited.
 * Withdrawn rows are in neither. Both are readings, never decisions: the quota
 * is enforced under a lock on the allocation that crosses a deposit
 * (`app/lib/finances/seminar-inscription-allocation.server.ts`).
 */
export type SeminarListItem = SeminarRow & {
  availablePlaces: number;
  /** How many people are registered, covered or not. */
  registeredCount: number;
  /**
   * Every row the seminar holds, withdrawn ones included, which is the only
   * count that answers whether `deleteSeminar` would refuse: a withdrawn row
   * keeps its money and its comprobante line, so it blocks the delete while
   * appearing on no roster.
   */
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
    | "has-comprobantes"
    | "covered-inscriptions"
    | "quota-below-covered"
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
  const seminarIds = eventSeminars.map((seminar) => seminar.id);
  const [inscriptionCounts, coveredCounts] = await Promise.all([
    countInscriptionsBySeminar(seminarIds),
    countCoveredSeminarInscriptionsBySeminar(seminarIds),
  ]);

  return eventSeminars.map((seminar) =>
    toSeminarListItem(seminar, {
      coveredCount: coveredCounts.get(seminar.id) ?? 0,
      ...(inscriptionCounts.get(seminar.id) ?? emptyInscriptionCounts),
    }),
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

  return toSeminarListItem(seminar, {
    coveredCount: await countCoveredSeminarInscriptions(seminar.id),
    ...(await countSeminarInscriptions(seminar.id)),
  });
}

type SeminarInscriptionCounts = {
  inscriptionCount: number;
  registeredCount: number;
};

const emptyInscriptionCounts: SeminarInscriptionCounts = {
  inscriptionCount: 0,
  registeredCount: 0,
};

/**
 * One query for the whole list, so a gallery of seminars does not become one
 * count per card, and both counts off the same scan: the roster reading leaves
 * withdrawn rows out, the delete reading keeps them in.
 */
async function countInscriptionsBySeminar(
  seminarIds: string[],
  executor: SeminarExecutor = db,
) {
  if (seminarIds.length === 0) {
    return new Map<string, SeminarInscriptionCounts>();
  }

  const rows = await executor
    .select({
      seminarId: seminarInscriptions.seminarId,
      inscriptionCount: sql<number>`count(*)`,
      registeredCount: sql<number>`count(*) filter (where ${activeSeminarInscription()})`,
    })
    .from(seminarInscriptions)
    .where(inArray(seminarInscriptions.seminarId, seminarIds))
    .groupBy(seminarInscriptions.seminarId);

  return new Map(
    rows.map((row) => [
      row.seminarId,
      {
        inscriptionCount: Number(row.inscriptionCount),
        registeredCount: Number(row.registeredCount),
      },
    ]),
  );
}

async function countSeminarInscriptions(
  seminarId: string,
  executor: SeminarExecutor = db,
): Promise<SeminarInscriptionCounts> {
  const counts = await countInscriptionsBySeminar([seminarId], executor);

  return counts.get(seminarId) ?? emptyInscriptionCounts;
}

/** Every row of the seminar, withdrawn ones included: the only reading that
 * answers whether deleting the seminar would take something with it. */
async function countAllSeminarInscriptions(
  seminarId: string,
  executor: SeminarExecutor,
) {
  const [row] = await executor
    .select({ inscriptionCount: sql<number>`count(*)` })
    .from(seminarInscriptions)
    .where(eq(seminarInscriptions.seminarId, seminarId));

  return Number(row?.inscriptionCount ?? 0);
}

function toSeminarListItem(
  seminar: SeminarRow,
  counts: SeminarInscriptionCounts & { coveredCount: number },
): SeminarListItem {
  return {
    ...seminar,
    availablePlaces: Math.max(seminar.quota - counts.coveredCount, 0),
    inscriptionCount: counts.inscriptionCount,
    registeredCount: counts.registeredCount,
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
  // one the allocation path takes before it crosses a deposit. Counting outside
  // it would let a crossing land between the count and the update and leave the
  // seminar holding more covered inscriptions than its new quota describes.
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
    // away, and what gives a place away is a **covered** deposit: an inscription
    // that has not covered its own holds no place, so it does not hold the floor
    // up either. Raising the quota is always free. The count is taken under the
    // same lock the crossing takes, so a deposit cannot be covered between the
    // count and the update.
    const coveredCount = await countCoveredSeminarInscriptions(seminarId, tx);

    if (validation.input.quota < coveredCount) {
      return {
        ok: false,
        code: "quota-below-covered",
        error: `No se puede bajar el cupo a menos de ${coveredCount}: es la cantidad de inscripciones con la seña cubierta.`,
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
 *
 * **Withdrawn rows count.** They are off the roster but they are still rows, and
 * what they hold is money and comprobante lines: cascading them away is exactly
 * the destruction the withdrawal exists to prevent. A seminar becomes deletable
 * once every row is de-allocated and removed, and a row withdrawn while holding
 * money makes it permanently undeletable — which is the correct answer, not a
 * gap.
 */
export async function deleteSeminar(
  seminarId: string,
): Promise<SeminarDeleteResult> {
  // The fiscal root first, and deliberately OUTSIDE the transaction below: a
  // seminar that was ever invoiced is permanently undeletable, so there is no
  // race to close — nothing can annul the block, and a comprobante appearing
  // afterwards can only belong to a row the inscription guard already refuses.
  // Saying "it has inscriptions" here would promise a way out that fiscal
  // obligation does not give.
  if (await seminarHasComprobantes(seminarId)) {
    return {
      ok: false,
      code: "has-comprobantes",
      error: seminarHasComprobantesMessage,
    };
  }

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

    if ((await countAllSeminarInscriptions(seminarId, tx)) > 0) {
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

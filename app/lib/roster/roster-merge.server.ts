import { and, asc, count, eq, inArray, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/db";
import {
  choreographies,
  choreographyDancers,
  choreographyProfessors,
  dancers,
  events,
  professors,
  seminarInscriptions,
  seminars,
} from "@/db/schema";
import { redirectWithFlashNotification } from "@/lib/shared/flash-notification.server";
import { readFormString } from "@/lib/shared/forms";
import { formatSpanishList } from "@/lib/shared/text-normalization";

import {
  getRosterMergeKindCopy,
  mergeSurvivorFieldName,
  type MergeRefusedActionData,
  type RosterMergeCandidate,
  type RosterMergeEventInscriptions,
} from "./roster-merge.shared";
import type { RosterPersonKind } from "./roster-person-status.shared";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type MergeRosterPeopleResult =
  | {
      ok: true;
      survivor: { id: string; name: string };
      gainedDocument: boolean;
      moved: { choreographyInscriptions: number; seminarInscriptions: number };
    }
  | { ok: false; message: string };

type LockedPerson = {
  id: string;
  academyId: string;
  firstName: string;
  lastName: string;
  documentNumber: string | null;
};

/**
 * `mergeRosterPeople` —ui: "Fusionar"— folds a duplicate roster person into the
 * one that stays (PRD #1187). Both are of the same academy and the same kind;
 * every choreography and seminar inscription of the removed one moves to the
 * survivor, and the removed row is deleted, not archived: an archived duplicate
 * would still be a duplicate.
 *
 * The survivor keeps everything of its own — names, birth date, status,
 * document, images, verification — and takes from the removed row only a
 * document it lacks, together with that document's images and verification,
 * which describe it.
 *
 * No money moves. Allocations and comprobante lines point at inscription rows,
 * and the inscription rows move whole, so every figure stays where it was. That
 * is also why the merge is refused when both people share a choreography or a
 * seminar: the two inscriptions cannot become one without moving money, so the
 * operator withdraws one first.
 */
export async function mergeRosterPeople(input: {
  kind: RosterPersonKind;
  removedId: string;
  survivorId: string;
}): Promise<MergeRosterPeopleResult> {
  const copy = getRosterMergeKindCopy(input.kind);

  if (input.removedId === input.survivorId) {
    return { ok: false, message: copy.sameRowMessage };
  }

  return await db.transaction(async (tx) => {
    const locked = await lockPeople(tx, input);
    const removed = locked.find((person) => person.id === input.removedId);
    const survivor = locked.find((person) => person.id === input.survivorId);

    if (!removed) {
      throw new Response(copy.notFoundMessage, { status: 404 });
    }

    if (!survivor) {
      return { ok: false, message: copy.survivorNotFoundMessage };
    }

    if (removed.academyId !== survivor.academyId) {
      return { ok: false, message: copy.otherAcademyMessage };
    }

    const sharedChoreographies = await findSharedChoreographies(tx, input);

    if (sharedChoreographies.length > 0) {
      return {
        ok: false,
        message: `No se puede fusionar: los dos están en ${formatSpanishList(
          sharedChoreographies.map((name) => `«${name}»`),
        )}. Quitá a uno de la coreografía antes de fusionar.`,
      };
    }

    const sharedSeminars = await findSharedSeminars(tx, input);

    if (sharedSeminars.length > 0) {
      return {
        ok: false,
        message: `No se puede fusionar: los dos están inscriptos en el seminario de ${formatSpanishList(
          sharedSeminars,
        )}. Quitá a uno del seminario antes de fusionar.`,
      };
    }

    const moved = await moveInscriptions(tx, input);
    const gainedDocument =
      survivor.documentNumber === null && removed.documentNumber !== null;

    await replaceRemovedPerson(tx, { ...input, gainedDocument });

    return {
      ok: true,
      survivor: {
        id: survivor.id,
        name: `${survivor.firstName} ${survivor.lastName}`,
      },
      gainedDocument,
      moved,
    };
  });
}

const mergeDestinations = {
  dancer: {
    notification: "bailarines-fusionados",
    path: "/administracion/bailarines",
  },
  professor: {
    notification: "profesores-fusionados",
    path: "/administracion/profesores",
  },
} as const satisfies Record<
  RosterPersonKind,
  { notification: string; path: string }
>;

/**
 * The panel's merge intent, shared by the dancer and the professor detail. The
 * removed person's page stops existing, so a merge redirects to the survivor
 * with a flash (docs/agents/form-feedback.md); a refusal leaves the operator on
 * the same page and returns to the dialog as action data.
 */
export async function submitRosterMerge(input: {
  formData: FormData;
  kind: RosterPersonKind;
  personId: string;
}): Promise<MergeRefusedActionData> {
  if (readFormString(input.formData, "id") !== input.personId) {
    return {
      status: "merge-refused",
      message: "Confirmá la fusión desde la ficha.",
    };
  }

  const result = await mergeRosterPeople({
    kind: input.kind,
    removedId: input.personId,
    survivorId: readFormString(input.formData, mergeSurvivorFieldName),
  });

  if (!result.ok) {
    return { status: "merge-refused", message: result.message };
  }

  const destination = mergeDestinations[input.kind];

  throw await redirectWithFlashNotification(
    `${destination.path}/${result.survivor.id}`,
    destination.notification,
  );
}

/**
 * What the merge dialog offers and summarises for one person: the other
 * people of the same academy and kind, and the removed person's inscriptions
 * counted by event, withdrawn ones included, since they move too.
 */
export async function loadRosterMergeOptions(input: {
  kind: RosterPersonKind;
  personId: string;
}): Promise<{
  candidates: RosterMergeCandidate[];
  inscriptionsByEvent: RosterMergeEventInscriptions[];
}> {
  const table = input.kind === "dancer" ? dancers : professors;
  const academyIdOfPerson = db
    .select({ academyId: table.academyId })
    .from(table)
    .where(eq(table.id, input.personId));
  const candidates = await db
    .select({
      active: table.active,
      documentNumber: table.documentNumber,
      firstName: table.firstName,
      id: table.id,
      lastName: table.lastName,
    })
    .from(table)
    .where(
      and(
        inArray(table.academyId, academyIdOfPerson),
        ne(table.id, input.personId),
      ),
    )
    .orderBy(asc(table.lastName), asc(table.firstName));

  return {
    candidates,
    inscriptionsByEvent: await countInscriptionsByEvent(input),
  };
}

async function lockPeople(
  tx: Transaction,
  input: { kind: RosterPersonKind; removedId: string; survivorId: string },
): Promise<LockedPerson[]> {
  const table = input.kind === "dancer" ? dancers : professors;

  // Ordered by id, so two merges over the same pair lock in the same order.
  return await tx
    .select({
      academyId: table.academyId,
      documentNumber: table.documentNumber,
      firstName: table.firstName,
      id: table.id,
      lastName: table.lastName,
    })
    .from(table)
    .where(inArray(table.id, [input.removedId, input.survivorId]))
    .orderBy(asc(table.id))
    .for("update");
}

async function findSharedChoreographies(
  tx: Transaction,
  input: { kind: RosterPersonKind; removedId: string; survivorId: string },
) {
  if (input.kind === "dancer") {
    const other = alias(choreographyDancers, "survivor_inscription");
    const rows = await tx
      .select({ name: choreographies.name })
      .from(choreographyDancers)
      .innerJoin(
        other,
        eq(other.choreographyId, choreographyDancers.choreographyId),
      )
      .innerJoin(
        choreographies,
        eq(choreographies.id, choreographyDancers.choreographyId),
      )
      .where(
        and(
          eq(choreographyDancers.dancerId, input.removedId),
          eq(other.dancerId, input.survivorId),
        ),
      )
      .orderBy(asc(choreographies.name));

    return rows.map((row) => row.name);
  }

  const other = alias(choreographyProfessors, "survivor_link");
  const rows = await tx
    .select({ name: choreographies.name })
    .from(choreographyProfessors)
    .innerJoin(
      other,
      eq(other.choreographyId, choreographyProfessors.choreographyId),
    )
    .innerJoin(
      choreographies,
      eq(choreographies.id, choreographyProfessors.choreographyId),
    )
    .where(
      and(
        eq(choreographyProfessors.professorId, input.removedId),
        eq(other.professorId, input.survivorId),
      ),
    )
    .orderBy(asc(choreographies.name));

  return rows.map((row) => row.name);
}

async function findSharedSeminars(
  tx: Transaction,
  input: { kind: RosterPersonKind; removedId: string; survivorId: string },
) {
  const personColumn =
    input.kind === "dancer" ? "dancerId" : ("professorId" as const);
  const other = alias(seminarInscriptions, "survivor_seminar_inscription");
  const rows = await tx
    .select({
      instructorName: seminars.instructorName,
      scheduledDate: seminars.scheduledDate,
    })
    .from(seminarInscriptions)
    .innerJoin(other, eq(other.seminarId, seminarInscriptions.seminarId))
    .innerJoin(seminars, eq(seminars.id, seminarInscriptions.seminarId))
    .where(
      and(
        eq(seminarInscriptions[personColumn], input.removedId),
        eq(other[personColumn], input.survivorId),
      ),
    )
    .orderBy(asc(seminars.scheduledDate), asc(seminars.instructorName));

  return rows.map((row) => row.instructorName);
}

async function moveInscriptions(
  tx: Transaction,
  input: { kind: RosterPersonKind; removedId: string; survivorId: string },
) {
  const choreographyInscriptions =
    input.kind === "dancer"
      ? await tx
          .update(choreographyDancers)
          .set({ dancerId: input.survivorId })
          .where(eq(choreographyDancers.dancerId, input.removedId))
          .returning({ id: choreographyDancers.id })
      : await tx
          .update(choreographyProfessors)
          .set({ professorId: input.survivorId })
          .where(eq(choreographyProfessors.professorId, input.removedId))
          .returning({ id: choreographyProfessors.choreographyId });
  const movedSeminarInscriptions =
    input.kind === "dancer"
      ? await tx
          .update(seminarInscriptions)
          .set({ dancerId: input.survivorId })
          .where(eq(seminarInscriptions.dancerId, input.removedId))
          .returning({ id: seminarInscriptions.id })
      : await tx
          .update(seminarInscriptions)
          .set({ professorId: input.survivorId })
          .where(eq(seminarInscriptions.professorId, input.removedId))
          .returning({ id: seminarInscriptions.id });

  return {
    choreographyInscriptions: choreographyInscriptions.length,
    seminarInscriptions: movedSeminarInscriptions.length,
  };
}

/**
 * Deletes the removed row and, when the survivor lacks a document, hands it the
 * removed one. The delete comes first: the document number is unique within
 * the academy, so the survivor can only take it once the removed row is gone.
 */
async function replaceRemovedPerson(
  tx: Transaction,
  input: {
    kind: RosterPersonKind;
    removedId: string;
    survivorId: string;
    gainedDocument: boolean;
  },
) {
  const updatedAt = new Date();

  if (input.kind === "dancer") {
    const [removed] = await tx
      .delete(dancers)
      .where(eq(dancers.id, input.removedId))
      .returning();

    if (input.gainedDocument) {
      await tx
        .update(dancers)
        .set({
          documentBackImageStorageKey: removed.documentBackImageStorageKey,
          documentFrontImageStorageKey: removed.documentFrontImageStorageKey,
          documentNumber: removed.documentNumber,
          documentType: removed.documentType,
          identityVerifiedAt: removed.identityVerifiedAt,
          updatedAt,
        })
        .where(eq(dancers.id, input.survivorId));
    }

    return;
  }

  const [removed] = await tx
    .delete(professors)
    .where(eq(professors.id, input.removedId))
    .returning();

  if (input.gainedDocument) {
    await tx
      .update(professors)
      .set({
        documentNumber: removed.documentNumber,
        documentType: removed.documentType,
        updatedAt,
      })
      .where(eq(professors.id, input.survivorId));
  }
}

async function countInscriptionsByEvent(input: {
  kind: RosterPersonKind;
  personId: string;
}): Promise<RosterMergeEventInscriptions[]> {
  const choreographyRows =
    input.kind === "dancer"
      ? await db
          .select({
            eventId: events.id,
            eventName: events.name,
            total: count(),
          })
          .from(choreographyDancers)
          .innerJoin(
            choreographies,
            eq(choreographies.id, choreographyDancers.choreographyId),
          )
          .innerJoin(events, eq(events.id, choreographies.eventId))
          .where(eq(choreographyDancers.dancerId, input.personId))
          .groupBy(events.id, events.name)
      : await db
          .select({
            eventId: events.id,
            eventName: events.name,
            total: count(),
          })
          .from(choreographyProfessors)
          .innerJoin(
            choreographies,
            eq(choreographies.id, choreographyProfessors.choreographyId),
          )
          .innerJoin(events, eq(events.id, choreographies.eventId))
          .where(eq(choreographyProfessors.professorId, input.personId))
          .groupBy(events.id, events.name);
  const seminarRows = await db
    .select({ eventId: events.id, eventName: events.name, total: count() })
    .from(seminarInscriptions)
    .innerJoin(seminars, eq(seminars.id, seminarInscriptions.seminarId))
    .innerJoin(events, eq(events.id, seminars.eventId))
    .where(
      eq(
        input.kind === "dancer"
          ? seminarInscriptions.dancerId
          : seminarInscriptions.professorId,
        input.personId,
      ),
    )
    .groupBy(events.id, events.name);
  const byEvent = new Map<string, RosterMergeEventInscriptions>();

  for (const row of choreographyRows) {
    byEvent.set(row.eventId, {
      choreographies: row.total,
      eventName: row.eventName,
      seminars: 0,
    });
  }

  for (const row of seminarRows) {
    const entry = byEvent.get(row.eventId) ?? {
      choreographies: 0,
      eventName: row.eventName,
      seminars: 0,
    };

    byEvent.set(row.eventId, { ...entry, seminars: row.total });
  }

  return [...byEvent.values()].sort((a, b) =>
    a.eventName.localeCompare(b.eventName, "es"),
  );
}

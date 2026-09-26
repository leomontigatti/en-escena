import { eq, sum } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  choreographyDancers,
  choreographyProfessors,
  dancers,
  paymentAllocations,
  payments,
  professors,
  seminarInscriptions,
  seminars,
} from "@/db/schema";
import {
  createAcademySession,
  createDancer,
  createProfessor,
} from "@/lib/choreographies/registration-test-fixtures.server.db";
import {
  createEventChoreographyFixture,
  createSavedEvent,
} from "@/lib/events/bases-test-fixtures.server.db";
import {
  loadRosterMergeOptions,
  mergeRosterPeople,
} from "@/lib/roster/roster-merge.server";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

describe("mergeRosterPeople", () => {
  test("moves every inscription of the removed dancer to the survivor, with its money", async () => {
    const { academyId, event } = await createRoster("Mueve");
    const survivor = await createDancer(academyId, { firstName: "Ana" });
    const removed = await createDancer(academyId, { firstName: "Anita" });
    const choreography = await createEventChoreographyFixture({
      academyId,
      dancerIds: [removed.id],
      eventId: event.id,
      name: "Fuego",
    });
    const seminar = await createEventSeminar(event.id);
    const [seminarInscription] = await db
      .insert(seminarInscriptions)
      .values({ seminarId: seminar.id, dancerId: removed.id })
      .returning();
    const payment = await createPayment({ academyId, eventId: event.id });
    const [choreographyInscription] = await db
      .select({ id: choreographyDancers.id })
      .from(choreographyDancers)
      .where(eq(choreographyDancers.choreographyId, choreography.id));

    await db.insert(paymentAllocations).values([
      {
        academyId,
        amount: 4000,
        choreographyInscriptionId: choreographyInscription.id,
        eventId: event.id,
        paymentId: payment.id,
      },
      {
        academyId,
        amount: 1500,
        eventId: event.id,
        paymentId: payment.id,
        seminarInscriptionId: seminarInscription.id,
      },
    ]);

    const result = await mergeRosterPeople({
      kind: "dancer",
      removedId: removed.id,
      survivorId: survivor.id,
    });

    expect(result).toMatchObject({ ok: true });
    await expect(
      db
        .select({ dancerId: choreographyDancers.dancerId })
        .from(choreographyDancers)
        .where(eq(choreographyDancers.id, choreographyInscription.id)),
    ).resolves.toEqual([{ dancerId: survivor.id }]);
    await expect(
      db
        .select({ dancerId: seminarInscriptions.dancerId })
        .from(seminarInscriptions)
        .where(eq(seminarInscriptions.id, seminarInscription.id)),
    ).resolves.toEqual([{ dancerId: survivor.id }]);
    await expect(allocatedTotal(event.id)).resolves.toBe(5500);
    await expect(
      db
        .select({ id: dancers.id })
        .from(dancers)
        .where(eq(dancers.id, removed.id)),
    ).resolves.toEqual([]);
  });
  test("keeps the survivor's own document when both have one", async () => {
    const { academyId } = await createRoster("Documento propio");
    const verifiedAt = new Date("2030-04-01T12:00:00Z");
    const survivor = await createDancer(academyId, {
      documentFrontImageStorageKey: "survivor-front",
      documentNumber: "30111222",
      documentType: "dni",
      identityVerifiedAt: verifiedAt,
    });
    const removed = await createDancer(academyId, {
      documentFrontImageStorageKey: "removed-front",
      documentNumber: "30111223",
      documentType: "dni",
    });

    const result = await mergeRosterPeople({
      kind: "dancer",
      removedId: removed.id,
      survivorId: survivor.id,
    });

    expect(result).toMatchObject({ ok: true, gainedDocument: false });
    await expect(readDancerDocument(survivor.id)).resolves.toEqual({
      documentFrontImageStorageKey: "survivor-front",
      documentNumber: "30111222",
      documentType: "dni",
      identityVerifiedAt: verifiedAt,
    });
  });

  test("hands the survivor the removed document, images and verification when it has none", async () => {
    const { academyId } = await createRoster("Documento ajeno");
    const verifiedAt = new Date("2030-04-01T12:00:00Z");
    const survivor = await createDancer(academyId, { firstName: "Sin DNI" });
    const removed = await createDancer(academyId, {
      documentFrontImageStorageKey: "removed-front",
      documentNumber: "30111222",
      documentType: "other",
      identityVerifiedAt: verifiedAt,
    });

    const result = await mergeRosterPeople({
      kind: "dancer",
      removedId: removed.id,
      survivorId: survivor.id,
    });

    expect(result).toMatchObject({ ok: true, gainedDocument: true });
    await expect(readDancerDocument(survivor.id)).resolves.toEqual({
      documentFrontImageStorageKey: "removed-front",
      documentNumber: "30111222",
      documentType: "other",
      identityVerifiedAt: verifiedAt,
    });
  });

  test("refuses when both dancers are in the same choreography, naming it, and changes nothing", async () => {
    const { academyId, event } = await createRoster("Elenco");
    const survivor = await createDancer(academyId);
    const removed = await createDancer(academyId);

    await createEventChoreographyFixture({
      academyId,
      dancerIds: [survivor.id, removed.id],
      eventId: event.id,
      name: "Dúo Compartido",
    });

    const result = await mergeRosterPeople({
      kind: "dancer",
      removedId: removed.id,
      survivorId: survivor.id,
    });

    expect(result).toEqual({
      ok: false,
      message:
        "No se puede fusionar: los dos están en «Dúo Compartido». Quitá a uno de la coreografía antes de fusionar.",
    });
    await expect(
      db
        .select({ dancerId: choreographyDancers.dancerId })
        .from(choreographyDancers)
        .where(eq(choreographyDancers.dancerId, removed.id)),
    ).resolves.toHaveLength(1);
    await expect(
      db
        .select({ id: dancers.id })
        .from(dancers)
        .where(eq(dancers.id, removed.id)),
    ).resolves.toHaveLength(1);
  });

  test("refuses when both dancers are in the same seminar, naming its instructor", async () => {
    const { academyId, event } = await createRoster("Seminario");
    const survivor = await createDancer(academyId);
    const removed = await createDancer(academyId);
    const seminar = await createEventSeminar(event.id, "Abril Sosa");

    await db.insert(seminarInscriptions).values([
      { dancerId: survivor.id, seminarId: seminar.id },
      { dancerId: removed.id, seminarId: seminar.id },
    ]);

    await expect(
      mergeRosterPeople({
        kind: "dancer",
        removedId: removed.id,
        survivorId: survivor.id,
      }),
    ).resolves.toEqual({
      ok: false,
      message:
        "No se puede fusionar: los dos están inscriptos en el seminario de Abril Sosa. Quitá a uno del seminario antes de fusionar.",
    });
  });

  test("refuses a survivor of another academy", async () => {
    const { academyId } = await createRoster("Una");
    const other = await createRoster("Otra");
    const survivor = await createDancer(other.academyId);
    const removed = await createDancer(academyId);

    await expect(
      mergeRosterPeople({
        kind: "dancer",
        removedId: removed.id,
        survivorId: survivor.id,
      }),
    ).resolves.toEqual({
      ok: false,
      message: "Solo se pueden fusionar bailarines de la misma academia.",
    });
    await expect(
      db
        .select({ id: dancers.id })
        .from(dancers)
        .where(eq(dancers.id, removed.id)),
    ).resolves.toHaveLength(1);
  });

  test("refuses a survivor of the other kind", async () => {
    const { academyId } = await createRoster("Tipo");
    const professor = await createProfessor(academyId);
    const removed = await createDancer(academyId);

    await expect(
      mergeRosterPeople({
        kind: "dancer",
        removedId: removed.id,
        survivorId: professor.id,
      }),
    ).resolves.toMatchObject({ ok: false });
    await expect(
      db
        .select({ id: dancers.id })
        .from(dancers)
        .where(eq(dancers.id, removed.id)),
    ).resolves.toHaveLength(1);
  });

  test("moves a professor's choreographies and takes the document it lacks", async () => {
    const { academyId, event } = await createRoster("Profesores");
    const survivor = await createProfessor(academyId);
    const removed = await createProfessor(academyId, {
      documentNumber: "20111222",
      documentType: "dni",
    });
    const choreography = await createEventChoreographyFixture({
      academyId,
      eventId: event.id,
      name: "Enseñada",
      professorIds: [removed.id],
    });

    const result = await mergeRosterPeople({
      kind: "professor",
      removedId: removed.id,
      survivorId: survivor.id,
    });

    expect(result).toMatchObject({
      ok: true,
      gainedDocument: true,
      moved: { choreographyInscriptions: 1, seminarInscriptions: 0 },
    });
    await expect(
      db
        .select({ professorId: choreographyProfessors.professorId })
        .from(choreographyProfessors)
        .where(eq(choreographyProfessors.choreographyId, choreography.id)),
    ).resolves.toEqual([{ professorId: survivor.id }]);
    await expect(
      db
        .select({ documentNumber: professors.documentNumber })
        .from(professors)
        .where(eq(professors.id, survivor.id)),
    ).resolves.toEqual([{ documentNumber: "20111222" }]);
    await expect(
      db
        .select({ id: professors.id })
        .from(professors)
        .where(eq(professors.id, removed.id)),
    ).resolves.toEqual([]);
  });
});

describe("loadRosterMergeOptions", () => {
  test("offers the other people of the same academy and kind, and counts the inscriptions by event", async () => {
    const { academyId, event } = await createRoster("Opciones");
    const other = await createRoster("Ajena");
    const person = await createDancer(academyId, { lastName: "Actual" });
    const candidate = await createDancer(academyId, {
      active: false,
      firstName: "Bea",
      lastName: "Archivada",
    });

    await createDancer(other.academyId, { lastName: "De Otra" });
    await createProfessor(academyId, { lastName: "Profesora" });
    await createEventChoreographyFixture({
      academyId,
      dancerIds: [person.id],
      eventId: event.id,
      name: "Una",
    });
    await db.insert(seminarInscriptions).values({
      dancerId: person.id,
      seminarId: (await createEventSeminar(event.id)).id,
    });

    await expect(
      loadRosterMergeOptions({ kind: "dancer", personId: person.id }),
    ).resolves.toEqual({
      candidates: [
        {
          active: false,
          documentNumber: null,
          firstName: "Bea",
          id: candidate.id,
          lastName: "Archivada",
        },
      ],
      inscriptionsByEvent: [
        { choreographies: 1, eventName: event.name, seminars: 1 },
      ],
    });
  });
});

async function readDancerDocument(dancerId: string) {
  const [row] = await db
    .select({
      documentFrontImageStorageKey: dancers.documentFrontImageStorageKey,
      documentNumber: dancers.documentNumber,
      documentType: dancers.documentType,
      identityVerifiedAt: dancers.identityVerifiedAt,
    })
    .from(dancers)
    .where(eq(dancers.id, dancerId));

  return row;
}

async function createRoster(academyName: string) {
  const academy = await createAcademySession({
    academyName: `Academia ${academyName}`,
    email: `${crypto.randomUUID()}@example.com`,
  });
  const event = await createSavedEvent(`Evento ${academyName}`);

  return { academyId: academy.academyId, event };
}

async function createEventSeminar(
  eventId: string,
  instructorName = "Abril Sosa",
) {
  const [seminar] = await db
    .insert(seminars)
    .values({
      eventId,
      instructorName,
      quota: 20,
      scheduledDate: "2030-10-10",
      startTime: "18:30",
    })
    .returning();

  return seminar;
}

async function createPayment(input: { academyId: string; eventId: string }) {
  const [payment] = await db
    .insert(payments)
    .values({
      academyId: input.academyId,
      amount: 10000,
      eventId: input.eventId,
      paymentDate: "2030-05-01",
      paymentMethod: "efectivo",
      paymentNumber: 1,
    })
    .returning();

  return payment;
}

async function allocatedTotal(eventId: string) {
  const [row] = await db
    .select({ total: sum(paymentAllocations.amount).mapWith(Number) })
    .from(paymentAllocations)
    .where(eq(paymentAllocations.eventId, eventId));

  return row?.total ?? 0;
}

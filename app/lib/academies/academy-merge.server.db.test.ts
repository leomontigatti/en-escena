import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  academies,
  choreographies,
  comprobantes,
  dancers,
  paymentAllocations,
  payments,
  professors,
  seminarInscriptions,
  seminars,
  user,
  choreographyDancers,
} from "@/db/schema";
import {
  loadAcademyMergeOptions,
  mergeAcademies,
} from "@/lib/academies/academy-merge.server";
import {
  createDancer,
  createProfessor,
} from "@/lib/choreographies/registration-test-fixtures.server.db";
import {
  createEventChoreographyFixture,
  createSavedEvent,
} from "@/lib/events/bases-test-fixtures.server.db";
import { createAcademyUser } from "@/lib/test-support/academies";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

describe("mergeAcademies", () => {
  test("moves everything the removed academy holds to the survivor and deletes its user", async () => {
    const survivor = await createAcademy("Academia Queda");
    const removed = await createAcademy("Academia Se Va");
    const event = await createSavedEvent("Evento Fusión");
    const dancer = await createDancer(removed.academyId);
    const professor = await createProfessor(removed.academyId);
    const choreography = await createEventChoreographyFixture({
      academyId: removed.academyId,
      dancerIds: [dancer.id],
      eventId: event.id,
      name: "Mudanza",
      professorIds: [professor.id],
    });
    const [seminar] = await db
      .insert(seminars)
      .values({
        eventId: event.id,
        instructorName: "Abril Sosa",
        quota: 20,
        scheduledDate: "2030-10-10",
        startTime: "18:30",
      })
      .returning();
    const [seminarInscription] = await db
      .insert(seminarInscriptions)
      .values({ dancerId: dancer.id, seminarId: seminar.id })
      .returning();
    const [payment] = await db
      .insert(payments)
      .values({
        academyId: removed.academyId,
        amount: 5000,
        eventId: event.id,
        paymentDate: "2030-05-01",
        paymentMethod: "efectivo",
        paymentNumber: 1,
      })
      .returning();
    const [inscription] = await db
      .select({ id: choreographyDancers.id })
      .from(choreographyDancers)
      .where(eq(choreographyDancers.choreographyId, choreography.id));

    await db.insert(paymentAllocations).values([
      {
        academyId: removed.academyId,
        amount: 3000,
        choreographyInscriptionId: inscription.id,
        eventId: event.id,
        paymentId: payment.id,
      },
      {
        academyId: removed.academyId,
        amount: 2000,
        eventId: event.id,
        paymentId: payment.id,
        seminarInscriptionId: seminarInscription.id,
      },
    ]);

    const result = await mergeAcademies({
      removedId: removed.academyId,
      survivorId: survivor.academyId,
    });

    expect(result).toEqual({
      ok: true,
      survivor: { id: survivor.academyId, name: "Academia Queda" },
    });
    await expect(academyOf(dancers, dancer.id)).resolves.toBe(
      survivor.academyId,
    );
    await expect(academyOf(professors, professor.id)).resolves.toBe(
      survivor.academyId,
    );
    await expect(academyOf(choreographies, choreography.id)).resolves.toBe(
      survivor.academyId,
    );
    await expect(academyOf(payments, payment.id)).resolves.toBe(
      survivor.academyId,
    );
    await expect(
      db
        .select({ academyId: paymentAllocations.academyId })
        .from(paymentAllocations)
        .where(eq(paymentAllocations.paymentId, payment.id)),
    ).resolves.toEqual([
      { academyId: survivor.academyId },
      { academyId: survivor.academyId },
    ]);
    await expect(
      db
        .select({ dancerId: seminarInscriptions.dancerId })
        .from(seminarInscriptions)
        .where(eq(seminarInscriptions.id, seminarInscription.id)),
    ).resolves.toEqual([{ dancerId: dancer.id }]);
    await expect(
      db
        .select({ id: academies.id })
        .from(academies)
        .where(eq(academies.id, removed.academyId)),
    ).resolves.toEqual([]);
    await expect(
      db.select({ id: user.id }).from(user).where(eq(user.id, removed.userId)),
    ).resolves.toEqual([]);
  });

  test("refuses when the removed academy has a comprobante, and changes nothing", async () => {
    const survivor = await createAcademy("Academia Queda");
    const removed = await createAcademy("Academia Facturada");
    const event = await createSavedEvent("Evento Comprobante");
    const dancer = await createDancer(removed.academyId);
    const choreography = await createEventChoreographyFixture({
      academyId: removed.academyId,
      eventId: event.id,
      name: "Facturada",
    });

    await db.insert(comprobantes).values({
      academyId: removed.academyId,
      cae: "12345678901234",
      caeVto: "20300601",
      cbteFch: "20300501",
      cbteNro: 1,
      cbteTipo: 11,
      choreographyId: choreography.id,
      eventId: event.id,
      impTotal: 1000,
      issuerCuit: "30717611590",
      issuerIvaCondition: "exento",
      ptoVta: 1,
      receptorDocNro: "0",
      receptorDocTipo: 99,
      receptorIvaConditionId: 5,
    });

    await expect(
      mergeAcademies({
        removedId: removed.academyId,
        survivorId: survivor.academyId,
      }),
    ).resolves.toEqual({
      ok: false,
      message:
        "No se puede fusionar: Academia Facturada tiene comprobantes emitidos, y un comprobante no cambia de academia.",
    });
    await expect(academyOf(dancers, dancer.id)).resolves.toBe(
      removed.academyId,
    );
  });

  test("refuses when a document number is on both rosters, naming the pairs", async () => {
    const survivor = await createAcademy("Academia Queda");
    const removed = await createAcademy("Academia Duplicada");
    const dancer = await createDancer(removed.academyId, {
      documentNumber: "30111222",
      documentType: "dni",
      firstName: "Ana",
      lastName: "Paz",
    });

    await createDancer(survivor.academyId, {
      documentNumber: "30111222",
      documentType: "other",
      firstName: "Anita",
      lastName: "Paz",
    });
    await createProfessor(removed.academyId, {
      documentNumber: "20111222",
      firstName: "Luz",
      lastName: "Sur",
    });
    await createProfessor(survivor.academyId, {
      documentNumber: "20111222",
      firstName: "Lucía",
      lastName: "Sur",
    });

    await expect(
      mergeAcademies({
        removedId: removed.academyId,
        survivorId: survivor.academyId,
      }),
    ).resolves.toEqual({
      ok: false,
      message:
        "No se puede fusionar: estos documentos están en las dos academias: bailarín Ana Paz y Anita Paz (30111222) y profesor Luz Sur y Lucía Sur (20111222). Quitá el documento de uno de cada par antes de fusionar.",
    });
    await expect(academyOf(dancers, dancer.id)).resolves.toBe(
      removed.academyId,
    );
  });

  test("refuses merging an academy into itself", async () => {
    const academy = await createAcademy("Academia Sola");

    await expect(
      mergeAcademies({
        removedId: academy.academyId,
        survivorId: academy.academyId,
      }),
    ).resolves.toEqual({
      ok: false,
      message: "Elegí otra academia para fusionar.",
    });
  });
});

describe("loadAcademyMergeOptions", () => {
  test("offers every other academy and counts what the removed one holds", async () => {
    const removed = await createAcademy("Academia Se Va");
    const other = await createAcademy("Academia Queda");
    const event = await createSavedEvent("Evento Opciones");
    const dancer = await createDancer(removed.academyId);

    await createDancer(removed.academyId, { firstName: "Bea" });
    await createEventChoreographyFixture({
      academyId: removed.academyId,
      dancerIds: [dancer.id],
      eventId: event.id,
      name: "Una",
    });

    await expect(loadAcademyMergeOptions(removed.academyId)).resolves.toEqual({
      candidates: [
        {
          email: other.email,
          id: other.academyId,
          name: "Academia Queda",
        },
      ],
      holdings: {
        choreographies: 1,
        comprobantes: 0,
        dancers: 2,
        payments: 0,
        professors: 0,
      },
    });
  });
});

async function createAcademy(name: string) {
  const email = `${crypto.randomUUID()}@example.com`;
  const created = await createAcademyUser({ academyName: name, email });

  return { academyId: created.academyId, email, userId: created.userId };
}

async function academyOf(
  table:
    | typeof dancers
    | typeof professors
    | typeof choreographies
    | typeof payments,
  id: string,
) {
  const [row] = await db
    .select({ academyId: table.academyId })
    .from(table)
    .where(eq(table.id, id));

  return row?.academyId;
}

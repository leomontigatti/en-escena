import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { dancers, seminarInscriptions } from "@/db/schema";
import {
  createDancer,
  createProfessor,
} from "@/features/portal/choreographies/test-support/db";
import { createAcademyRecord } from "@/features/portal/test-support/db";
import {
  confirmIndividualLink,
  revokeIndividualLink,
} from "@/lib/individuals/link.server";
import { readLinkedIndividualSeminarInscriptions } from "@/lib/seminars/linked-individual-inscriptions.server";
import { createSeminar } from "@/lib/seminars/repository.server";
import { createSignedInRequest } from "@/lib/test-support/auth";
import { createSavedEvent } from "@/lib/test-support/events";
import { createIndividualUser } from "@/lib/test-support/individuals";
import { defaultSeminarFacts } from "@/lib/test-support/seminars";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

const documentNumber = "30123456";
const photoKey = "individuals/photo.jpg";

describe("the linked individuals' seminar inscriptions an academy sees", () => {
  test("reads an individual's inscription when its confirmed link reaches an active row of the academy", async () => {
    const fixture = await seedFixture();
    const inscriptionId = await registerIndividual(fixture);

    await expect(read(fixture)).resolves.toEqual([
      {
        firstName: "Ana",
        inscriptionId,
        instructorName: "Abril Sosa",
        lastName: "Pérez",
        scheduledDate: "2099-10-10",
        seminarId: fixture.seminarId,
      },
    ]);
  });

  test("reads it through a professor row too, under the academy's name for the row", async () => {
    const fixture = await seedFixture({ withDancer: false });
    await createProfessor(fixture.academyId, {
      documentNumber: "30.123.456",
      documentType: "dni",
      firstName: "Anita",
      lastName: "Pérez Gil",
    });
    const inscriptionId = await registerIndividual(fixture);

    await expect(read(fixture)).resolves.toEqual([
      {
        firstName: "Anita",
        inscriptionId,
        instructorName: "Abril Sosa",
        lastName: "Pérez Gil",
        scheduledDate: "2099-10-10",
        seminarId: fixture.seminarId,
      },
    ]);
  });

  test("reads it once when the link reaches two active rows of the academy", async () => {
    const fixture = await seedFixture();
    await createProfessor(fixture.academyId, {
      documentNumber,
      documentType: "dni",
    });
    await registerIndividual(fixture);

    await expect(read(fixture)).resolves.toHaveLength(1);
  });

  test("reads nothing while the link is not confirmed", async () => {
    const fixture = await seedFixture({ confirmed: false });
    await registerIndividual(fixture);

    await expect(read(fixture)).resolves.toEqual([]);
  });

  test("reads nothing once administration revokes the link", async () => {
    const fixture = await seedFixture();
    await registerIndividual(fixture);

    await revokeIndividualLink(fixture.individualId);

    await expect(read(fixture)).resolves.toEqual([]);
  });

  test("reads nothing once the academy archives the linked row", async () => {
    const fixture = await seedFixture();
    await registerIndividual(fixture);

    await db
      .update(dancers)
      .set({ active: false })
      .where(eq(dancers.id, fixture.dancerId!));

    await expect(read(fixture)).resolves.toEqual([]);
  });

  test("reads nothing once the academy deletes the linked row", async () => {
    const fixture = await seedFixture();
    await registerIndividual(fixture);

    await db.delete(dancers).where(eq(dancers.id, fixture.dancerId!));

    await expect(read(fixture)).resolves.toEqual([]);
  });

  test("reads nothing for an academy the link does not reach", async () => {
    const fixture = await seedFixture();
    const other = await createAcademyRecord({
      academyName: "Academia Norte",
      email: `norte.${crypto.randomUUID()}@example.com`,
    });
    await createDancer(other.id, {
      documentNumber: "99888777",
      documentType: "dni",
    });
    await registerIndividual(fixture);

    await expect(
      readLinkedIndividualSeminarInscriptions({
        academyId: other.id,
        eventId: fixture.eventId,
      }),
    ).resolves.toEqual([]);
  });

  test("leaves out a withdrawn inscription", async () => {
    const fixture = await seedFixture();
    const inscriptionId = await registerIndividual(fixture);

    await db
      .update(seminarInscriptions)
      .set({ withdrawnAt: new Date() })
      .where(eq(seminarInscriptions.id, inscriptionId));

    await expect(read(fixture)).resolves.toEqual([]);
  });

  test("leaves out an academy's own inscription of the same person", async () => {
    const fixture = await seedFixture();
    // An inscription that names the roster row is the academy's own, read on
    // its own lists: only the individual's inscriptions are read here.
    await db
      .insert(seminarInscriptions)
      .values({ dancerId: fixture.dancerId!, seminarId: fixture.seminarId });

    await expect(read(fixture)).resolves.toEqual([]);
  });

  test("narrows to one seminar and to the event", async () => {
    const fixture = await seedFixture();
    const inscriptionId = await registerIndividual(fixture);
    const otherSeminarId = await addSeminar(fixture.eventId, "Bruno Díaz");
    await registerIndividual({ ...fixture, seminarId: otherSeminarId });
    const otherEvent = await createSavedEvent({ active: false });

    await expect(
      readLinkedIndividualSeminarInscriptions({
        academyId: fixture.academyId,
        eventId: fixture.eventId,
        seminarId: fixture.seminarId,
      }),
    ).resolves.toEqual([expect.objectContaining({ inscriptionId })]);
    await expect(
      readLinkedIndividualSeminarInscriptions({
        academyId: fixture.academyId,
        eventId: otherEvent.id,
      }),
    ).resolves.toEqual([]);
  });
});

type Fixture = Awaited<ReturnType<typeof seedFixture>>;

function read(fixture: Fixture) {
  return readLinkedIndividualSeminarInscriptions({
    academyId: fixture.academyId,
    eventId: fixture.eventId,
  });
}

async function seedFixture({
  confirmed = true,
  withDancer = true,
}: { confirmed?: boolean; withDancer?: boolean } = {}) {
  const academy = await createAcademyRecord({
    academyName: "Estudio Sur",
    email: `sur.${crypto.randomUUID()}@example.com`,
  });
  const dancer = withDancer
    ? await createDancer(academy.id, {
        documentNumber,
        documentType: "dni",
        firstName: "Ana",
        lastName: "Pérez",
      })
    : null;
  const individual = await createIndividualUser({
    documentNumber,
    documentPhotoStorageKey: photoKey,
    email: `particular.${crypto.randomUUID()}@example.com`,
    firstName: "Ana María",
    lastName: "Pérez",
  });

  if (confirmed) {
    const admin = await createSignedInRequest({
      email: `admin.${crypto.randomUUID()}@example.com`,
      role: "admin",
    });
    const result = await confirmIndividualLink({
      confirmedByUserId: admin.userId,
      documentNumber,
      documentPhotoStorageKey: photoKey,
      individualId: individual.individualId,
    });

    expect(result).toEqual({ ok: true });
  }

  const event = await createSavedEvent();
  const seminarId = await addSeminar(event.id, "Abril Sosa");

  return {
    academyId: academy.id,
    dancerId: dancer?.id ?? null,
    eventId: event.id,
    individualId: individual.individualId,
    seminarId,
  };
}

async function addSeminar(eventId: string, instructorName: string) {
  const created = await createSeminar(eventId, {
    instructorName,
    scheduledDate: "2099-10-10",
    startTime: "18:30",
    quota: 5,
    ...defaultSeminarFacts,
  });

  if (!created.ok) {
    throw new Error(created.error);
  }

  return created.seminar.id;
}

async function registerIndividual(fixture: {
  individualId: string;
  seminarId: string;
}) {
  const [row] = await db
    .insert(seminarInscriptions)
    .values({
      individualId: fixture.individualId,
      seminarId: fixture.seminarId,
    })
    .returning({ id: seminarInscriptions.id });

  return row!.id;
}

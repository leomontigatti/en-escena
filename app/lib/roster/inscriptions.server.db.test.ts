import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  choreographies,
  choreographyProfessors,
  seminarInscriptions,
  seminarPrices,
  seminars,
} from "@/db/schema";
import { createChoreographyRecord } from "@/features/portal/choreographies/test-support/db";
import {
  createDancer,
  createProfessor,
} from "@/lib/choreographies/registration-test-fixtures.server.db";
import {
  findProfessorChoreographies,
  findRosterSeminarInscriptions,
} from "@/lib/roster/inscriptions.server";
import type { RosterPersonKind } from "@/lib/roster/roster-person-status.shared";
import { createAcademyUser } from "@/lib/test-support/academies";

import { installDatabaseTestHooks } from "../../../tests/db/harness";
import {
  createAcademyFinanceChoreographyFixture,
  createInactiveEvent,
  createSavedEvent,
} from "../admin/finances/finances.test-support";

installDatabaseTestHooks();

async function createSeminar(input: {
  eventId: string;
  instructorName: string;
  kind?: "regular" | "special";
}) {
  const [seminar] = await db
    .insert(seminars)
    .values({
      eventId: input.eventId,
      instructorName: input.instructorName,
      kind: input.kind ?? "regular",
      quota: 20,
      scheduledDate: "2030-10-10",
      startTime: "18:30",
    })
    .returning();

  return seminar;
}

/**
 * A person on the roster of no choreography, so every seminar prices them as a
 * non-participant: `Común` at 30000 and `Exclusivo` at 50000. One inscription
 * is withdrawn, holding no money, and one belongs to another event.
 */
async function seedSeminarFixture(kind: RosterPersonKind) {
  const event = await createSavedEvent();
  const otherEvent = await createInactiveEvent("En Escena 2025");
  const academy = await createAcademyUser({
    academyName: "Academia Seminarios",
    email: `seminarios.${crypto.randomUUID()}@example.com`,
  });
  const person =
    kind === "dancer"
      ? await createDancer(academy.academyId)
      : await createProfessor(academy.academyId);
  const personColumn = kind === "dancer" ? "dancerId" : "professorId";

  await db.insert(seminarPrices).values(
    [
      { amount: 20000, forParticipants: true, kind: "regular" as const },
      { amount: 30000, forParticipants: false, kind: "regular" as const },
      { amount: 40000, forParticipants: true, kind: "special" as const },
      { amount: 50000, forParticipants: false, kind: "special" as const },
    ].map((price) => ({
      ...price,
      eventId: event.id,
      name: `Precio ${price.kind} ${price.amount}`,
      paymentDeadline: null,
    })),
  );

  const regular = await createSeminar({
    eventId: event.id,
    instructorName: "Bruno Vals",
  });
  const special = await createSeminar({
    eventId: event.id,
    instructorName: "Abril Sosa",
    kind: "special",
  });
  const withdrawn = await createSeminar({
    eventId: event.id,
    instructorName: "Carla Tango",
  });
  const elsewhere = await createSeminar({
    eventId: otherEvent.id,
    instructorName: "Diego Jazz",
  });

  const inscriptionIds = new Map<string, string>();
  for (const seminar of [regular, special, withdrawn, elsewhere]) {
    const [row] = await db
      .insert(seminarInscriptions)
      .values({ [personColumn]: person.id, seminarId: seminar.id })
      .returning();

    inscriptionIds.set(seminar.instructorName, row.id);
  }

  await db
    .update(seminarInscriptions)
    .set({ withdrawnAt: new Date() })
    .where(
      eq(seminarInscriptions.id, inscriptionIds.get(withdrawn.instructorName)!),
    );

  return {
    event,
    inscriptionIds,
    person: { id: person.id, kind },
    regular,
    special,
    withdrawn,
  };
}

describe("findRosterSeminarInscriptions", () => {
  test.each(["dancer", "professor"] as const)(
    "lists a %s's seminar inscriptions of the event, withdrawn ones included, priced by the finance read model",
    async (kind) => {
      const fixture = await seedSeminarFixture(kind);

      const inscriptions = await findRosterSeminarInscriptions({
        person: fixture.person,
        selectedEventId: fixture.event.id,
      });

      const expected = (
        seminar: typeof fixture.regular,
        totalAmount: number,
      ) => ({
        id: fixture.inscriptionIds.get(seminar.instructorName),
        seminarId: seminar.id,
        instructorName: seminar.instructorName,
        eventName: fixture.event.name,
        kind: seminar.kind,
        scheduledDate: "2030-10-10",
        startTime: "18:30",
        totalAmount,
      });

      expect(inscriptions).toEqual([
        expected(fixture.special, 50000),
        expected(fixture.regular, 30000),
        // A withdrawn inscription's total is what remains allocated to it.
        expected(fixture.withdrawn, 0),
      ]);
    },
  );

  test("reads nothing without a selected event", async () => {
    const fixture = await seedSeminarFixture("dancer");

    await expect(
      findRosterSeminarInscriptions({
        person: fixture.person,
        selectedEventId: null,
      }),
    ).resolves.toEqual([]);
  });
});

describe("findProfessorChoreographies", () => {
  test("lists the choreographies a professor is linked to in the event, a withdrawn one included", async () => {
    const event = await createSavedEvent();
    const { academy, catalog, choreography } =
      await createAcademyFinanceChoreographyFixture({
        academyName: "Academia Profesores",
        choreographyName: "Aire",
        email: `profesores.${crypto.randomUUID()}@example.com`,
        event,
      });
    const withdrawn = await createChoreographyRecord({
      academyId: academy.academy.id,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: "Brisa",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });
    await db
      .update(choreographies)
      .set({ withdrawnAt: new Date() })
      .where(eq(choreographies.id, withdrawn.id));
    const professor = await createProfessor(academy.academy.id);
    await db.insert(choreographyProfessors).values([
      { choreographyId: choreography.id, professorId: professor.id },
      { choreographyId: withdrawn.id, professorId: professor.id },
    ]);
    const [aire, brisa] = await db
      .select()
      .from(choreographies)
      .where(eq(choreographies.eventId, event.id))
      .orderBy(choreographies.name);

    const rows = await findProfessorChoreographies({
      professorId: professor.id,
      selectedEventId: event.id,
    });

    expect(rows).toEqual([
      {
        id: aire.id,
        choreographyName: "Aire",
        choreographyNumber: aire.choreographyNumber,
        eventName: event.name,
        categoryName: catalog.categoryWithLevel.name,
        groupType: aire.groupType,
      },
      {
        id: brisa.id,
        choreographyName: "Brisa",
        choreographyNumber: brisa.choreographyNumber,
        eventName: event.name,
        categoryName: catalog.categoryWithLevel.name,
        groupType: brisa.groupType,
      },
    ]);
  });

  test("reads nothing without a selected event", async () => {
    await expect(
      findProfessorChoreographies({
        professorId: crypto.randomUUID(),
        selectedEventId: null,
      }),
    ).resolves.toEqual([]);
  });
});

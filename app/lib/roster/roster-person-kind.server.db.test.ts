import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { seminarInscriptions } from "@/db/schema";
import {
  createDancer,
  createProfessor,
} from "@/lib/choreographies/registration.test-support";
import {
  seminarInscriptionPersonOf,
  seminarInscriptionPersonValues,
} from "@/lib/roster/roster-person-kind.server";
import { createSeminar } from "@/lib/seminars/repository.server";
import { createAcademyUser } from "@/lib/test-support/academies";
import { createSavedEvent, eventDates } from "@/lib/test-support/events";
import { createIndividualUser } from "@/lib/test-support/individuals";
import { defaultSeminarFacts } from "@/lib/test-support/seminars";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

async function createFixture() {
  const event = await createSavedEvent({
    name: "Regional 2026",
    active: false,
    ...eventDates(2030),
  });
  const seminar = await createSeminar(event.id, {
    instructorName: "Abril Sosa",
    scheduledDate: "2026-10-10",
    startTime: "18:30",
    quota: 2,
    ...defaultSeminarFacts,
  });

  if (!seminar.ok) {
    throw new Error(`Expected the seminar to be saved: ${seminar.error}`);
  }

  const { academy } = await createAcademyUser({
    academyName: "Academia Arco",
    email: `${crypto.randomUUID()}@example.com`,
  });
  const individual = await createIndividualUser({
    email: `${crypto.randomUUID()}@example.com`,
  });

  return {
    dancer: await createDancer(academy.id),
    individual: { id: individual.individualId },
    professor: await createProfessor(academy.id),
    seminarId: seminar.seminar.id,
  };
}

// #1479: the seminar inscription names exactly one person. The code owner and
// the `seminar_inscription_exactly_one_person` CHECK are the same rule. #1665
// adds the individual as the third person it may name.
describe("the seminar inscription's person (#1479)", () => {
  test.each(["dancer", "professor", "individual"] as const)(
    "writes a %s and reads the same person back off the row",
    async (kind) => {
      const fixture = await createFixture();
      const person = { kind, personId: fixture[kind].id };

      const [inserted] = await db
        .insert(seminarInscriptions)
        .values({
          seminarId: fixture.seminarId,
          ...seminarInscriptionPersonValues(person),
        })
        .returning({ id: seminarInscriptions.id });
      const [row] = await db
        .select({
          dancerId: seminarInscriptions.dancerId,
          individualId: seminarInscriptions.individualId,
          professorId: seminarInscriptions.professorId,
        })
        .from(seminarInscriptions)
        .where(eq(seminarInscriptions.id, inserted.id));

      expect(seminarInscriptionPersonOf(row)).toEqual(person);
    },
  );

  test("is refused by the database with two people or with none", async () => {
    const fixture = await createFixture();

    await expect(
      db.insert(seminarInscriptions).values({
        seminarId: fixture.seminarId,
        dancerId: fixture.dancer.id,
        professorId: fixture.professor.id,
      }),
    ).rejects.toMatchObject({
      cause: { constraint_name: "seminar_inscription_exactly_one_person" },
    });
    await expect(
      db.insert(seminarInscriptions).values({
        seminarId: fixture.seminarId,
        dancerId: fixture.dancer.id,
        individualId: fixture.individual.id,
      }),
    ).rejects.toMatchObject({
      cause: { constraint_name: "seminar_inscription_exactly_one_person" },
    });
    await expect(
      db.insert(seminarInscriptions).values({ seminarId: fixture.seminarId }),
    ).rejects.toMatchObject({
      cause: { constraint_name: "seminar_inscription_exactly_one_person" },
    });
  });

  test("refuses to read a row with two people or with none", () => {
    expect(() =>
      seminarInscriptionPersonOf({
        dancerId: "a",
        individualId: null,
        professorId: "b",
      }),
    ).toThrow();
    expect(() =>
      seminarInscriptionPersonOf({
        dancerId: null,
        individualId: "c",
        professorId: "b",
      }),
    ).toThrow();
    expect(() =>
      seminarInscriptionPersonOf({
        dancerId: null,
        individualId: null,
        professorId: null,
      }),
    ).toThrow();
  });
});

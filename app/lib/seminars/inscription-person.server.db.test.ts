import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { seminarInscriptions } from "@/db/schema";
import {
  createDancer,
  createProfessor,
} from "@/lib/choreographies/registration.test-support";
import { seminarInscriptionPersonValues } from "@/lib/roster/roster-person-kind.server";
import type { InscriptionPersonKind } from "@/lib/roster/roster-person-kind.shared";
import {
  seminarInscriptionOwnedBy,
  seminarInscriptionPerson,
} from "@/lib/seminars/inscription-person.server";
import { createSeminar } from "@/lib/seminars/repository.server";
import { createAcademyUser } from "@/lib/test-support/academies";
import { createSavedEvent, eventDates } from "@/lib/test-support/events";
import { createIndividualUser } from "@/lib/test-support/individuals";
import { defaultSeminarFacts } from "@/lib/test-support/seminars";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

async function createAcademyWithPeople(academyName: string) {
  const { academy } = await createAcademyUser({
    academyName,
    email: `${crypto.randomUUID()}@example.com`,
  });

  return {
    academyId: academy.id,
    dancer: await createDancer(academy.id),
    professor: await createProfessor(academy.id),
  };
}

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
    quota: 10,
    ...defaultSeminarFacts,
  });

  if (!seminar.ok) {
    throw new Error(`Expected the seminar to be saved: ${seminar.error}`);
  }

  return {
    arco: await createAcademyWithPeople("Academia Arco"),
    brisa: await createAcademyWithPeople("Academia Brisa"),
    seminarId: seminar.seminar.id,
  };
}

async function register(
  seminarId: string,
  person: { kind: InscriptionPersonKind; personId: string },
) {
  const [inserted] = await db
    .insert(seminarInscriptions)
    .values({ seminarId, ...seminarInscriptionPersonValues(person) })
    .returning({ id: seminarInscriptions.id });

  return inserted.id;
}

// #1664: one owner for who a seminar inscription is for and which academy owns it.
describe("a seminar inscription's person and owner (#1664)", () => {
  test.each(["dancer", "professor"] as const)(
    "reads a %s's kind, name and academy off the inscription",
    async (kind) => {
      const fixture = await createFixture();
      const person = fixture.arco[kind];
      const inscriptionId = await register(fixture.seminarId, {
        kind,
        personId: person.id,
      });

      const rows = await db
        .select({
          academyId: seminarInscriptionPerson.academyId,
          firstName: seminarInscriptionPerson.firstName,
          kind: seminarInscriptionPerson.kind,
          lastName: seminarInscriptionPerson.lastName,
          personId: seminarInscriptionPerson.personId,
        })
        .from(seminarInscriptions)
        .innerJoin(
          seminarInscriptionPerson,
          eq(seminarInscriptionPerson.inscriptionId, seminarInscriptions.id),
        )
        .where(eq(seminarInscriptions.id, inscriptionId));

      expect(rows).toEqual([
        {
          academyId: fixture.arco.academyId,
          firstName: person.firstName,
          kind,
          lastName: person.lastName,
          personId: person.id,
        },
      ]);
    },
  );

  // #1665: an individual registers itself, owned by its own owner row.
  test("reads an individual's kind, name and owner row off the inscription", async () => {
    const fixture = await createFixture();
    const individual = await createIndividualUser({
      email: `${crypto.randomUUID()}@example.com`,
      firstName: "Clara",
      lastName: "Ríos",
    });
    const inscriptionId = await register(fixture.seminarId, {
      kind: "individual",
      personId: individual.individualId,
    });

    const rows = await db
      .select({
        academyId: seminarInscriptionPerson.academyId,
        firstName: seminarInscriptionPerson.firstName,
        kind: seminarInscriptionPerson.kind,
        lastName: seminarInscriptionPerson.lastName,
        personId: seminarInscriptionPerson.personId,
      })
      .from(seminarInscriptions)
      .innerJoin(
        seminarInscriptionPerson,
        eq(seminarInscriptionPerson.inscriptionId, seminarInscriptions.id),
      )
      .where(eq(seminarInscriptions.id, inscriptionId));

    expect(rows).toEqual([
      {
        academyId: individual.ownerId,
        firstName: "Clara",
        kind: "individual",
        lastName: "Ríos",
        personId: individual.individualId,
      },
    ]);
    await expect(
      db
        .select({ id: seminarInscriptions.id })
        .from(seminarInscriptions)
        .where(seminarInscriptionOwnedBy(individual.ownerId)),
    ).resolves.toEqual([{ id: inscriptionId }]);
    await expect(
      db
        .select({ id: seminarInscriptions.id })
        .from(seminarInscriptions)
        .where(seminarInscriptionOwnedBy(fixture.arco.academyId)),
    ).resolves.toEqual([]);
  });

  test("narrows to the inscriptions whose person belongs to the academies", async () => {
    const fixture = await createFixture();
    const arcoDancer = await register(fixture.seminarId, {
      kind: "dancer",
      personId: fixture.arco.dancer.id,
    });
    const arcoProfessor = await register(fixture.seminarId, {
      kind: "professor",
      personId: fixture.arco.professor.id,
    });
    const brisaDancer = await register(fixture.seminarId, {
      kind: "dancer",
      personId: fixture.brisa.dancer.id,
    });

    const ownedBy = async (
      academy: Parameters<typeof seminarInscriptionOwnedBy>[0],
    ) =>
      (
        await db
          .select({ id: seminarInscriptions.id })
          .from(seminarInscriptions)
          .where(seminarInscriptionOwnedBy(academy))
      )
        .map((row) => row.id)
        .sort();

    expect(await ownedBy(fixture.arco.academyId)).toEqual(
      [arcoDancer, arcoProfessor].sort(),
    );
    expect(
      await ownedBy([fixture.arco.academyId, fixture.brisa.academyId]),
    ).toEqual([arcoDancer, arcoProfessor, brisaDancer].sort());
    expect(await ownedBy([])).toEqual([]);
  });
});

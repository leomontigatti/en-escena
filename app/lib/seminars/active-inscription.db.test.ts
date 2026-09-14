import { and, asc, eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { seminarInscriptions, seminars } from "@/db/schema";
import { createDancer } from "@/lib/choreographies/registration-test-fixtures.server.db";
import { createSavedEvent } from "@/lib/events/bases-test-fixtures.server.db";
import {
  activeSeminarInscription,
  activeSeminarInscriptionSql,
} from "@/lib/seminars/active-inscription";
import { createAcademyUser } from "@/lib/test-support/academies";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

describe("active seminar inscription predicate", () => {
  test("agrees with its raw-SQL twin over a seminar that holds withdrawn rows", async () => {
    const event = await createSavedEvent(`Regional ${crypto.randomUUID()}`);
    const academy = await createAcademyUser({
      academyName: "Academia Predicado",
      email: `predicado.${crypto.randomUUID()}@example.com`,
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

    const [ana, bea, cami] = await Promise.all([
      createDancer(academy.academyId, { firstName: "Ana", lastName: "Uno" }),
      createDancer(academy.academyId, { firstName: "Bea", lastName: "Dos" }),
      createDancer(academy.academyId, { firstName: "Cami", lastName: "Tres" }),
    ]);
    await db.insert(seminarInscriptions).values([
      { dancerId: ana.id, seminarId: seminar.id },
      {
        dancerId: bea.id,
        seminarId: seminar.id,
        withdrawnAt: new Date("2030-05-01T12:00:00Z"),
      },
      { dancerId: cami.id, seminarId: seminar.id },
    ]);

    const [byPredicate, byTwin] = await Promise.all([
      db
        .select({ dancerId: seminarInscriptions.dancerId })
        .from(seminarInscriptions)
        .where(
          and(
            eq(seminarInscriptions.seminarId, seminar.id),
            activeSeminarInscription(),
          ),
        )
        .orderBy(asc(seminarInscriptions.dancerId)),
      db
        .select({ dancerId: seminarInscriptions.dancerId })
        .from(seminarInscriptions)
        .where(
          and(
            eq(seminarInscriptions.seminarId, seminar.id),
            activeSeminarInscriptionSql("en_escena_seminar_inscription"),
          ),
        )
        .orderBy(asc(seminarInscriptions.dancerId)),
    ]);

    expect(byPredicate).toEqual(byTwin);
    expect(new Set(byPredicate.map((row) => row.dancerId))).toEqual(
      new Set([ana.id, cami.id]),
    );
  });
});

import { and, asc, eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { choreographyDancers } from "@/db/schema";
import { createChoreographyRecord } from "@/features/portal/choreographies/test-support/db";
import {
  activeInscription,
  activeInscriptionSql,
} from "@/lib/choreographies/active-inscription";
import {
  createAcademySession,
  createDancer,
  createEventCatalog,
  createEventRecord,
} from "@/lib/choreographies/registration-test-fixtures.server.db";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

describe("active inscription predicate", () => {
  test("agrees with its raw-SQL twin over a roster that contains withdrawn rows", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Predicado",
      email: "predicado.academia@example.com",
    });
    const event = await createEventRecord({ active: true, name: "Regional" });
    const catalog = await createEventCatalog(event.id);
    const [dancerA, dancerB, dancerC] = await Promise.all([
      createDancer(owner.academyId, { firstName: "Ana", lastName: "Uno" }),
      createDancer(owner.academyId, { firstName: "Bea", lastName: "Dos" }),
      createDancer(owner.academyId, { firstName: "Cami", lastName: "Tres" }),
    ]);
    const choreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.teenCategory.id,
      eventId: event.id,
      groupType: "trio",
      modalityId: catalog.modality.id,
      name: "Trio",
      scheduleCapacityId: catalog.duoScheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });
    await db.insert(choreographyDancers).values([
      {
        ageAtEventStart: 14,
        choreographyId: choreography.id,
        dancerId: dancerA.id,
      },
      {
        ageAtEventStart: 14,
        choreographyId: choreography.id,
        dancerId: dancerB.id,
        withdrawnAt: new Date("2026-04-01T12:00:00Z"),
      },
      {
        ageAtEventStart: 14,
        choreographyId: choreography.id,
        dancerId: dancerC.id,
      },
    ]);

    const [byPredicate, byTwin] = await Promise.all([
      db
        .select({ dancerId: choreographyDancers.dancerId })
        .from(choreographyDancers)
        .where(
          and(
            eq(choreographyDancers.choreographyId, choreography.id),
            activeInscription(),
          ),
        )
        .orderBy(asc(choreographyDancers.dancerId)),
      db
        .select({ dancerId: choreographyDancers.dancerId })
        .from(choreographyDancers)
        .where(
          and(
            eq(choreographyDancers.choreographyId, choreography.id),
            activeInscriptionSql("en_escena_choreography_dancer"),
          ),
        )
        .orderBy(asc(choreographyDancers.dancerId)),
    ]);

    expect(byPredicate).toEqual(byTwin);
    expect(new Set(byPredicate.map((row) => row.dancerId))).toEqual(
      new Set([dancerA.id, dancerC.id]),
    );
  });
});

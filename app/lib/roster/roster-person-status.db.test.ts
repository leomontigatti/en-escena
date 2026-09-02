import { and, asc, eq, inArray } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { dancers, professors } from "@/db/schema";
import {
  createAcademySession,
  createDancer,
  createProfessor,
} from "@/lib/choreographies/registration-test-fixtures.server.db";
import {
  activeRosterPerson,
  rosterPersonStatusCondition,
} from "@/lib/roster/roster-person-status.server";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

describe("active roster person predicate", () => {
  test("keeps only the active people of both tables", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Alta",
      email: "alta.academia@example.com",
    });
    const [activeDancer, archivedDancer] = await Promise.all([
      createDancer(owner.academyId, { firstName: "Ana", lastName: "Activa" }),
      createDancer(owner.academyId, {
        active: false,
        firstName: "Bea",
        lastName: "Archivada",
      }),
    ]);
    const [activeProfessor, archivedProfessor] = await Promise.all([
      createProfessor(owner.academyId, {
        firstName: "Cami",
        lastName: "Activa",
      }),
      createProfessor(owner.academyId, {
        active: false,
        firstName: "Dana",
        lastName: "Archivada",
      }),
    ]);
    const dancerIds = [activeDancer.id, archivedDancer.id];
    const professorIds = [activeProfessor.id, archivedProfessor.id];

    const [activeDancers, activeProfessors] = await Promise.all([
      db
        .select({ id: dancers.id })
        .from(dancers)
        .where(and(inArray(dancers.id, dancerIds), activeRosterPerson(dancers)))
        .orderBy(asc(dancers.id)),
      db
        .select({ id: professors.id })
        .from(professors)
        .where(
          and(
            inArray(professors.id, professorIds),
            activeRosterPerson(professors),
          ),
        )
        .orderBy(asc(professors.id)),
    ]);

    expect(activeDancers.map((row) => row.id)).toEqual([activeDancer.id]);
    expect(activeProfessors.map((row) => row.id)).toEqual([activeProfessor.id]);
  });

  test("filters by the three values of the axis, and by nothing for 'all'", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Filtro",
      email: "filtro.academia@example.com",
    });
    const [activeDancer, archivedDancer] = await Promise.all([
      createDancer(owner.academyId, { firstName: "Ema", lastName: "Activa" }),
      createDancer(owner.academyId, {
        active: false,
        firstName: "Flor",
        lastName: "Archivada",
      }),
    ]);

    async function listWith(
      filter: Parameters<typeof rosterPersonStatusCondition>[1],
    ) {
      const condition = rosterPersonStatusCondition(dancers, filter);
      const rows = await db
        .select({ id: dancers.id })
        .from(dancers)
        .where(and(eq(dancers.academyId, owner.academyId), condition))
        .orderBy(asc(dancers.firstName));

      return rows.map((row) => row.id);
    }

    expect(await listWith("active")).toEqual([activeDancer.id]);
    expect(await listWith("archived")).toEqual([archivedDancer.id]);
    expect(await listWith("all")).toEqual([activeDancer.id, archivedDancer.id]);
    expect(rosterPersonStatusCondition(dancers, "all")).toBeUndefined();
  });
});

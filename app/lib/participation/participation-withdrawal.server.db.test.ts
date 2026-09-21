import { eq, inArray } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  choreographies,
  choreographyDancers,
  choreographyProfessors,
  dancers as dancersTable,
  professors as professorsTable,
} from "@/db/schema";
import { loadAcademiesList } from "@/features/admin/academies/list/server";
import { createChoreographyRecord } from "@/features/portal/choreographies/test-support/db";
import { createSignedInAdminRequest } from "@/lib/admin/test-support/db";
import {
  createAcademySession,
  createDancer,
  createEventCatalog,
  createEventRecord,
  createProfessor,
} from "@/lib/choreographies/registration-test-fixtures.server.db";
import {
  buildDancerAnyEventParticipationSql,
  buildDancerEventParticipationSql,
  buildProfessorAnyEventParticipationSql,
  buildProfessorEventParticipationSql,
  readEventParticipation,
} from "@/lib/participation/participation.server";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

const withdrawnAt = new Date("2026-09-17T12:00:00Z");

async function createChoreographyWithRoster(input: {
  academyId: string;
  catalog: Awaited<ReturnType<typeof createEventCatalog>>;
  eventId: string;
  name: string;
}) {
  const choreography = await createChoreographyRecord({
    academyId: input.academyId,
    categoryId: input.catalog.teenCategory.id,
    eventId: input.eventId,
    groupType: "solo",
    modalityId: input.catalog.modality.id,
    name: input.name,
    scheduleCapacityId: input.catalog.soloScheduleCapacity.id,
    submodalityId: input.catalog.submodality.id,
  });
  const dancer = await createDancer(input.academyId, {
    firstName: input.name,
    lastName: "Bailarina",
  });
  const professor = await createProfessor(input.academyId, {
    firstName: input.name,
    lastName: "Profesora",
  });
  await db.insert(choreographyDancers).values({
    ageAtEventStart: 14,
    choreographyId: choreography.id,
    dancerId: dancer.id,
  });
  await db.insert(choreographyProfessors).values({
    choreographyId: choreography.id,
    professorId: professor.id,
  });

  return { choreography, dancer, professor };
}

async function withdraw(choreographyId: string) {
  await db
    .update(choreographies)
    .set({ withdrawnAt })
    .where(eq(choreographies.id, choreographyId));
  await db
    .update(choreographyDancers)
    .set({ withdrawnAt })
    .where(eq(choreographyDancers.choreographyId, choreographyId));
}

describe("participation of a withdrawn choreography", () => {
  test("stops its professors, its dancers and its academy from participating", async () => {
    const withdrawnOwner = await createAcademySession({
      academyName: "Academia Retirada",
      email: "retirada.participacion@example.com",
    });
    const activeOwner = await createAcademySession({
      academyName: "Academia Vigente",
      email: "vigente.participacion@example.com",
    });
    const event = await createEventRecord({ active: true, name: "Regional" });
    const catalog = await createEventCatalog(event.id);
    const withdrawnSide = await createChoreographyWithRoster({
      academyId: withdrawnOwner.academyId,
      catalog,
      eventId: event.id,
      name: "Retirada",
    });
    const activeSide = await createChoreographyWithRoster({
      academyId: activeOwner.academyId,
      catalog,
      eventId: event.id,
      name: "Vigente",
    });

    await withdraw(withdrawnSide.choreography.id);

    const professorRows = await db
      .select({
        id: professorsTable.id,
        participatesInAnyEvent: buildProfessorAnyEventParticipationSql(),
        participatesInEvent: buildProfessorEventParticipationSql(event.id),
      })
      .from(professorsTable)
      .where(
        inArray(professorsTable.id, [
          withdrawnSide.professor.id,
          activeSide.professor.id,
        ]),
      );
    const professorById = new Map(professorRows.map((row) => [row.id, row]));

    expect(professorById.get(withdrawnSide.professor.id)).toMatchObject({
      participatesInAnyEvent: false,
      participatesInEvent: false,
    });
    expect(professorById.get(activeSide.professor.id)).toMatchObject({
      participatesInAnyEvent: true,
      participatesInEvent: true,
    });

    const dancerRows = await db
      .select({
        id: dancersTable.id,
        participatesInAnyEvent: buildDancerAnyEventParticipationSql(),
        participatesInEvent: buildDancerEventParticipationSql(event.id),
      })
      .from(dancersTable)
      .where(
        inArray(dancersTable.id, [
          withdrawnSide.dancer.id,
          activeSide.dancer.id,
        ]),
      );
    const dancerById = new Map(dancerRows.map((row) => [row.id, row]));

    expect(dancerById.get(withdrawnSide.dancer.id)).toMatchObject({
      participatesInAnyEvent: false,
      participatesInEvent: false,
    });
    expect(dancerById.get(activeSide.dancer.id)).toMatchObject({
      participatesInAnyEvent: true,
      participatesInEvent: true,
    });

    // Seminar participant pricing reads the same two predicates through this
    // map, so a withdrawn choreography must not name anybody here.
    const participation = await readEventParticipation(db, {
      dancerIds: [withdrawnSide.dancer.id, activeSide.dancer.id],
      eventId: event.id,
      professorIds: [withdrawnSide.professor.id, activeSide.professor.id],
    });

    expect(participation.dancerIds).toEqual(new Set([activeSide.dancer.id]));
    expect(participation.professorIds).toEqual(
      new Set([activeSide.professor.id]),
    );

    const { request } = await createSignedInAdminRequest({
      email: "admin.academias.participacion@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/academias?evento=${event.id}`,
    });
    const academiesList = await loadAcademiesList(request);
    const participatingByAcademy = new Map(
      academiesList.academies.map((academy) => [
        academy.id,
        academy.isParticipating,
      ]),
    );

    expect(participatingByAcademy.get(withdrawnOwner.academyId)).toBe(false);
    expect(participatingByAcademy.get(activeOwner.academyId)).toBe(true);
  });
});

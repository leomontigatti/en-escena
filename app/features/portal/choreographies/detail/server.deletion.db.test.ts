import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  categories,
  choreographies,
  choreographyDancers,
  choreographyProfessors,
  dancers,
  experienceLevels,
  professors,
  scheduleCapacities,
} from "@/db/schema";
import { handlePortalChoreographyDetailRouteAction as choreographyDetailAction } from "@/features/portal/choreographies/detail/server";
import {
  createAcademyRecord,
  createAcademySession,
  createChoreographyRecord,
  createDancer,
  createEventCatalog,
  createEventRecord,
  createProfessor,
  date,
} from "@/features/portal/choreographies/test-support/db";
import { deleteChoreographyFormData } from "@/features/portal/choreographies/test-support/forms";
import { createPortalPostRequest } from "@/features/portal/test-support/db";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

describe.sequential("portal choreography deletion", () => {
  test("deletes an eligible Coreografía from detail, cascades bridge rows, and redirects back to the list even when registration is closed", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Elegible",
      email: "coreografias.detail.delete.owner@example.com",
    });
    const event = await createEventRecord({
      active: true,
      name: "Regional 2026",
      registrationEndsAt: date("2000-04-30T12:00:00Z"),
    });
    const catalog = await createEventCatalog(event.id);
    const dancer = await createDancer(owner.academyId, {
      firstName: "Ana",
      lastName: "Paz",
      birthDate: "2011-04-05",
    });
    const professor = await createProfessor(owner.academyId, {
      firstName: "Luz",
      lastName: "Suárez",
    });
    const choreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      musicStorageKey: null,
      name: "A Eliminar",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });
    await db.insert(choreographyDancers).values({
      choreographyId: choreography.id,
      dancerId: dancer.id,
      ageAtEventStart: 15,
    });
    await db.insert(choreographyProfessors).values({
      choreographyId: choreography.id,
      professorId: professor.id,
    });

    const deleteResponse = await choreographyDetailAction({
      params: { choreographyId: choreography.id },
      request: createPortalPostRequest(
        `http://localhost/portal/coreografias/${choreography.id}?evento=${event.id}`,
        owner.cookie,
        deleteChoreographyFormData(choreography.id),
      ),
    });

    expect(deleteResponse).toBeInstanceOf(Response);
    if (!(deleteResponse instanceof Response)) {
      throw new Error("Expected redirect response.");
    }
    expect(deleteResponse.status).toBe(302);
    expect(deleteResponse.headers.get("location")).toBe(
      "/portal/coreografias?eliminada=1",
    );

    await expect(
      db.query.choreographies.findFirst({
        where: eq(choreographies.id, choreography.id),
      }),
    ).resolves.toBeUndefined();
    await expect(
      db.query.choreographyDancers.findMany({
        where: eq(choreographyDancers.choreographyId, choreography.id),
      }),
    ).resolves.toEqual([]);
    await expect(
      db.query.choreographyProfessors.findMany({
        where: eq(choreographyProfessors.choreographyId, choreography.id),
      }),
    ).resolves.toEqual([]);
  });

  test("rejects deleting a Coreografía ajena from the detail action", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Dueña",
      email: "coreografias.detail.delete.other-owner@example.com",
    });
    const other = await createAcademySession({
      academyName: "Academia Ajena",
      email: "coreografias.detail.delete.other@example.com",
    });
    const event = await createEventRecord({
      active: true,
      name: "Regional 2026",
    });
    const catalog = await createEventCatalog(event.id);
    const choreography = await createChoreographyRecord({
      academyId: other.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: "Ajena",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });

    await expect(
      choreographyDetailAction({
        params: { choreographyId: choreography.id },
        request: createPortalPostRequest(
          `http://localhost/portal/coreografias/${choreography.id}?evento=${event.id}`,
          owner.cookie,
          deleteChoreographyFormData(choreography.id),
        ),
      }),
    ).rejects.toMatchObject({
      status: 404,
    });

    await expect(
      db.query.choreographies.findFirst({
        where: eq(choreographies.id, choreography.id),
      }),
    ).resolves.toBeDefined();
  });

  test("keeps history-protecting foreign keys restrictive and cascades bridge rows only when the choreography is deleted", async () => {
    const academy = await createAcademyRecord({
      academyName: "Academia",
      email: "coreografias.schema@example.com",
    });
    const event = await createEventRecord({
      active: true,
      name: "Regional 2026",
    });
    const catalog = await createEventCatalog(event.id);
    const dancer = await createDancer(academy.id, {
      firstName: "Ana",
      lastName: "Paz",
      birthDate: "2012-01-10",
    });
    const professor = await createProfessor(academy.id, {
      firstName: "Luz",
      lastName: "Paz",
    });
    const choreography = await createChoreographyRecord({
      academyId: academy.id,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      musicStorageKey: "music/schema.mp3",
      name: "Protegida",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });
    await db.insert(choreographyDancers).values({
      choreographyId: choreography.id,
      dancerId: dancer.id,
      ageAtEventStart: 13,
    });
    await db.insert(choreographyProfessors).values({
      choreographyId: choreography.id,
      professorId: professor.id,
    });

    await expect(
      db.delete(dancers).where(eq(dancers.id, dancer.id)),
    ).rejects.toThrow();
    await expect(
      db.delete(professors).where(eq(professors.id, professor.id)),
    ).rejects.toThrow();
    await expect(
      db
        .delete(categories)
        .where(eq(categories.id, catalog.categoryWithLevel.id)),
    ).rejects.toThrow();
    await expect(
      db
        .delete(experienceLevels)
        .where(eq(experienceLevels.id, catalog.level.id)),
    ).rejects.toThrow();
    await expect(
      db
        .delete(scheduleCapacities)
        .where(eq(scheduleCapacities.id, catalog.scheduleCapacity.id)),
    ).rejects.toThrow();

    await db
      .delete(choreographies)
      .where(eq(choreographies.id, choreography.id));

    await expect(
      db.query.choreographyDancers.findMany({
        where: eq(choreographyDancers.choreographyId, choreography.id),
      }),
    ).resolves.toEqual([]);
    await expect(
      db.query.choreographyProfessors.findMany({
        where: eq(choreographyProfessors.choreographyId, choreography.id),
      }),
    ).resolves.toEqual([]);
  });
});

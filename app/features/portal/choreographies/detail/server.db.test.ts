import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { choreographyDancers, choreographyProfessors } from "@/db/schema";
import {
  handlePortalChoreographyDetailRouteAction as choreographyDetailAction,
  loadPortalChoreographyDetail as choreographyDetailLoader,
} from "@/features/portal/choreographies/detail/server";
import { createPortalPostRequest } from "@/features/portal/test-support/db";
import {
  createAcademySession,
  createChoreographyRecord,
  createDancer,
  createEventCatalog,
  createEventRecord,
  createProfessor,
} from "@/features/portal/choreographies/test-support/db";
import { musicUpdateFormData } from "@/features/portal/choreographies/test-support/forms";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

describe.sequential("portal choreographies reads", () => {
  test("shows detail only for the authenticated Academia inside the selected Evento and includes archived linked roster", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Dueña",
      email: "coreografias.detail.owner@example.com",
    });
    const other = await createAcademySession({
      academyName: "Academia Ajena",
      email: "coreografias.detail.other@example.com",
    });
    const event = await createEventRecord({
      active: true,
      name: "Regional 2026",
    });
    const catalog = await createEventCatalog(event.id);
    const archivedDancer = await createDancer(owner.academyId, {
      active: false,
      firstName: "Ana",
      lastName: "Archivada",
      birthDate: "2010-02-03",
    });
    const archivedProfessor = await createProfessor(owner.academyId, {
      active: false,
      firstName: "Luz",
      lastName: "Archivada",
    });
    const choreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      musicStorageKey: "music/detail.mp3",
      name: "Detalle Histórico",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });
    await db.insert(choreographyDancers).values({
      choreographyId: choreography.id,
      dancerId: archivedDancer.id,
      ageAtEventStart: 16,
    });
    await db.insert(choreographyProfessors).values({
      choreographyId: choreography.id,
      professorId: archivedProfessor.id,
    });

    const ownerDetail = await choreographyDetailLoader({
      params: { choreographyId: choreography.id },
      request: new Request(
        `http://localhost/portal/coreografias/${choreography.id}?evento=${event.id}`,
        {
          headers: { cookie: owner.cookie },
        },
      ),
    });

    expect(ownerDetail.choreography).toMatchObject({
      id: choreography.id,
      name: "Detalle Histórico",
      dancers: [
        {
          firstName: "Ana",
          lastName: "Archivada",
          active: false,
          ageAtEventStart: 16,
        },
      ],
      professors: [
        {
          firstName: "Luz",
          lastName: "Archivada",
          active: false,
        },
      ],
    });

    await expect(
      choreographyDetailLoader({
        params: { choreographyId: choreography.id },
        request: new Request(
          `http://localhost/portal/coreografias/${choreography.id}?evento=${event.id}`,
          {
            headers: { cookie: other.cookie },
          },
        ),
      }),
    ).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe.sequential("portal choreographies music-only editing", () => {
  test("keeps the linked roster untouched when the portal update submits dancer ids", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Music Only",
      email: "coreografias.detail.music-only@example.com",
    });
    const event = await createEventRecord({
      active: true,
      name: "Regional 2026",
    });
    const catalog = await createEventCatalog(event.id);
    const linkedDancer = await createDancer(owner.academyId, {
      active: true,
      firstName: "Ana",
      lastName: "Vinculada",
      birthDate: "2010-02-03",
    });
    const otherDancer = await createDancer(owner.academyId, {
      active: true,
      firstName: "Mora",
      lastName: "Intrusa",
      birthDate: "2010-02-03",
    });
    const choreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      musicStorageKey: "music/current.mp3",
      name: "Music only",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });
    await db.insert(choreographyDancers).values({
      choreographyId: choreography.id,
      dancerId: linkedDancer.id,
      ageAtEventStart: 16,
    });

    const response = await choreographyDetailAction({
      params: { choreographyId: choreography.id },
      request: createPortalPostRequest(
        `http://localhost/portal/coreografias/${choreography.id}?evento=${event.id}`,
        owner.cookie,
        musicUpdateFormData({
          musicStorageKey: "music/current.mp3",
          dancerIds: [otherDancer.id],
        }),
      ),
    });

    expect(response).toBeInstanceOf(Response);
    if (!(response instanceof Response)) {
      throw new Error("Expected a redirect Response.");
    }
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      `/portal/coreografias/${choreography.id}?notificacion=coreografia-guardada`,
    );

    const linkedDancerIds = await db
      .select({ dancerId: choreographyDancers.dancerId })
      .from(choreographyDancers)
      .where(eq(choreographyDancers.choreographyId, choreography.id));

    expect(linkedDancerIds).toEqual([{ dancerId: linkedDancer.id }]);
  });

  test("rejects an unsupported intent from the portal detail action", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Intent",
      email: "coreografias.detail.intent@example.com",
    });
    const event = await createEventRecord({
      active: true,
      name: "Regional 2026",
    });
    const catalog = await createEventCatalog(event.id);
    const choreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: "Intent inválido",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });
    const formData = new FormData();
    formData.set("intent", "resolve-choreography-dancers");

    await expect(
      choreographyDetailAction({
        params: { choreographyId: choreography.id },
        request: createPortalPostRequest(
          `http://localhost/portal/coreografias/${choreography.id}?evento=${event.id}`,
          owner.cookie,
          formData,
        ),
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

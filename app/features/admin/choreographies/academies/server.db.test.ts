import { expect, test } from "vitest";

import { db } from "@/db";
import { choreographyProfessors } from "@/db/schema";
import { loadChoreographyAcademies } from "@/features/admin/choreographies/academies/server";
import { createSignedInAdminRequest } from "@/lib/admin/test-support/db";
import { withdrawChoreographyForTest } from "@/lib/choreographies/withdrawn-choreography.test-support";
import { activateEvent, createEvent } from "@/lib/events/management.server";
import {
  createChoreographyRecord,
  createEventCatalog,
  createProfessor,
} from "@/features/portal/choreographies/test-support/db";
import { createAcademyRecord } from "@/features/portal/test-support/db";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

test("counts each academy's choreographies in the active event, withdrawn apart", async () => {
  const event = await createSavedEvent({ activate: true, name: "Nacional" });
  const catalog = await createEventCatalog(event.id);
  const sur = await createAcademyRecord({
    academyName: "Academia Sur",
    email: "coreografias.academias.sur@example.com",
  });
  const norte = await createAcademyRecord({
    academyName: "Academia Norte",
    email: "coreografias.academias.norte@example.com",
  });
  // Neither of these has anything in the active event, so neither is listed.
  await createAcademyRecord({
    academyName: "Academia Sin Coreografías",
    email: "coreografias.academias.vacia@example.com",
  });
  const elsewhere = await createAcademyRecord({
    academyName: "Academia de Otro Evento",
    email: "coreografias.academias.otro@example.com",
  });
  const otherEvent = await createSavedEvent({
    activate: false,
    name: "Regional",
  });
  const otherCatalog = await createEventCatalog(otherEvent.id);
  await createChoreographyRecord({
    academyId: elsewhere.id,
    categoryId: otherCatalog.categoryWithoutLevel.id,
    eventId: otherEvent.id,
    modalityId: otherCatalog.modality.id,
    name: "Coreografía de otro evento",
    scheduleCapacityId: otherCatalog.scheduleCapacity.id,
  });

  const createFor = async (
    academyId: string,
    name: string,
    options: { complete: boolean },
  ) => {
    const choreography = await createChoreographyRecord({
      academyId,
      // The category is the adult one, so the placement check passes.
      categoryAgeBasis: 30,
      categoryId: catalog.categoryWithoutLevel.id,
      eventId: event.id,
      modalityId: catalog.modality.id,
      musicStorageKey: options.complete ? `musica/${name}.mp3` : null,
      name,
      scheduleCapacityId: catalog.scheduleCapacity.id,
    });

    if (options.complete) {
      const professor = await createProfessor(academyId);
      await db
        .insert(choreographyProfessors)
        .values({ choreographyId: choreography.id, professorId: professor.id });
    }

    return choreography;
  };

  await createFor(sur.id, "Completa", { complete: true });
  await createFor(sur.id, "Incompleta", { complete: false });
  const surWithdrawn = await createFor(sur.id, "Retirada", { complete: false });
  await withdrawChoreographyForTest(surWithdrawn.id);
  // Everything withdrawn: still listed, since its page is where they are read.
  const norteWithdrawn = await createFor(norte.id, "Retirada del norte", {
    complete: true,
  });
  await withdrawChoreographyForTest(norteWithdrawn.id);

  const result = await loadAcademies("admin");

  expect(result.selectedEventId).toBe(event.id);
  expect(result.rows).toEqual([
    {
      academyId: norte.id,
      academyName: "Academia Norte",
      choreographyCount: 0,
      incompleteCount: 0,
      withdrawnCount: 1,
    },
    {
      academyId: sur.id,
      academyName: "Academia Sur",
      choreographyCount: 2,
      incompleteCount: 1,
      withdrawnCount: 1,
    },
  ]);
});

test("lets an auditor read the list and refuses an academy account", async () => {
  await createSavedEvent({ activate: true, name: "Nacional" });

  await expect(loadAcademies("auditor")).resolves.toEqual({
    rows: [],
    selectedEventId: expect.any(String),
  });
  await expect(loadAcademies("academy")).rejects.toBeInstanceOf(Response);
});

let requestCount = 0;

async function loadAcademies(role: "academy" | "admin" | "auditor") {
  const { request } = await createSignedInAdminRequest({
    email: `coreografias.academias.${role}.${(requestCount += 1)}@example.com`,
    requestUrl: "http://localhost/administracion/coreografias",
    role,
  });

  return await loadChoreographyAcademies(request);
}

async function createSavedEvent(input: { activate: boolean; name: string }) {
  const result = await createEvent({
    name: input.name,
    startsAt: new Date("2026-10-01T12:00:00Z"),
    endsAt: new Date("2026-10-10T12:00:00Z"),
  });

  if (!result.ok) {
    throw new Error(result.error);
  }

  if (input.activate) {
    await activateEvent(result.event.id);
  }

  return result.event;
}

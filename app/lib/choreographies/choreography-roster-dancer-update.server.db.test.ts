import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  choreographyDancers,
  scheduleCapacities,
  scheduleCategories,
  scheduleModalities,
  schedules,
} from "@/db/schema";
import { createChoreographyRecord } from "@/features/portal/choreographies/test-support/db";
import { resolveChoreographyDancerUpdateContext } from "@/lib/choreographies/choreography-roster-dancer-update.server";
import {
  createAcademySession,
  createDancer,
  createEventCatalog,
  createEventRecord,
} from "@/lib/choreographies/registration-test-fixtures.server.db";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

describe("choreography dancer update context", () => {
  test("abandons keep-current and resolves the other show when the roster change crosses categories", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Dos Funciones",
      email: "roster.dos.funciones@example.com",
    });
    const event = await createEventRecord({ active: true, name: "Regional" });
    const catalog = await createEventCatalog(event.id);
    // The modality split into two shows: the catalogue's block takes the
    // children, a second block takes the teenagers.
    const [secondShow] = await db
      .insert(schedules)
      .values({
        eventId: event.id,
        name: `Función 2 ${event.id}`,
        scheduledDate: "2026-05-01",
        startTime: "16:00",
        totalCapacity: 10,
      })
      .returning();
    await db.insert(scheduleModalities).values({
      scheduleId: secondShow.id,
      modalityId: catalog.modality.id,
    });
    const [secondShowSoloCapacity] = await db
      .insert(scheduleCapacities)
      .values({ scheduleId: secondShow.id, groupType: "solo", capacity: 5 })
      .returning();
    await db.insert(scheduleCategories).values([
      { scheduleId: catalog.schedule.id, categoryId: catalog.childCategory.id },
      { scheduleId: secondShow.id, categoryId: catalog.teenCategory.id },
    ]);
    const childDancer = await createDancer(owner.academyId, {
      birthDate: "2018-05-01",
      firstName: "Ana",
      lastName: "Nena",
    });
    const teenDancer = await createDancer(owner.academyId, {
      birthDate: "2008-05-01",
      firstName: "Bea",
      lastName: "Juvenil",
    });
    const choreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.childCategory.id,
      eventId: event.id,
      groupType: "solo",
      modalityId: catalog.modality.id,
      name: "Cruza de función",
      scheduleCapacityId: catalog.soloScheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });
    await db.insert(choreographyDancers).values({
      ageAtEventStart: 8,
      choreographyId: choreography.id,
      dancerId: childDancer.id,
    });

    await expect(
      resolveChoreographyDancerUpdateContext({
        academyId: owner.academyId,
        eventId: event.id,
        choreographyId: choreography.id,
        dancerIds: [teenDancer.id],
      }),
    ).resolves.toMatchObject({
      ok: true,
      resolution: { category: { id: catalog.teenCategory.id } },
      scheduleResolution: {
        status: "auto",
        canSave: true,
        selectedScheduleCapacityId: secondShowSoloCapacity.id,
      },
    });
    // The roster left where it was keeps the show it was in.
    await expect(
      resolveChoreographyDancerUpdateContext({
        academyId: owner.academyId,
        eventId: event.id,
        choreographyId: choreography.id,
        dancerIds: [childDancer.id],
      }),
    ).resolves.toMatchObject({
      ok: true,
      scheduleResolution: {
        status: "keep-current",
        selectedScheduleCapacityId: catalog.soloScheduleCapacity.id,
      },
    });
  });
});

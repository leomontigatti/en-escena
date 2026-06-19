import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { events } from "@/db/schema";
import {
  createCategory,
  createExperienceLevel,
  createModality,
  createPrice,
  createSchedule,
  createScheduleCapacity,
  createSubmodality,
} from "@/lib/events/bases-repository.server";
import { createEvent } from "@/lib/events/management.server";
import {
  getEventRegistrationReadiness,
  markEventRegistrationReadinessDirty,
} from "@/lib/events/registration-readiness.server";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

describe("event registration readiness", () => {
  test("reports missing compatible cupos de cronograma and applicable precios using the real bases del evento rules", async () => {
    const event = await createSavedEvent("Regional 2026");
    const jazz = await expectCreated(
      createModality(event.id, { name: "Jazz" }),
    );
    const inicial = await expectCreated(
      createExperienceLevel(event.id, { name: "Inicial" }),
    );

    await expectCreated(
      createSubmodality(event.id, {
        modalityId: jazz.id,
        name: "Jazz funk",
      }),
    );
    await expectCreated(
      createCategory(event.id, {
        name: "Infantil",
        minAge: 8,
        maxAge: 12,
        groupTypes: ["solo", "duo"],
        modalityIds: [jazz.id],
        experienceLevelIds: [inicial.id],
      }),
    );
    const block = await expectCreated(
      createSchedule(event.id, {
        name: "Sábado mañana",
        scheduledDate: "2026-05-02",
        startTime: "09:00",
        totalCapacity: 20,
        modalityIds: [jazz.id],
      }),
    );
    await expectCreated(
      createScheduleCapacity(block.id, {
        groupType: "solo",
        capacity: 8,
      }),
    );
    await expectCreated(
      createPrice(event.id, {
        groupType: "duo",
        amount: 15000,
        paymentDeadline: "2026-05-31",
        scheduleId: null,
      }),
    );

    await expect(
      getEventRegistrationReadiness(event.id),
    ).resolves.toMatchObject({
      isReady: false,
      missingItems: expect.arrayContaining([
        expect.objectContaining({
          code: "schedule-compatibility",
        }),
        expect.objectContaining({
          code: "price-coverage",
        }),
      ]),
    });
  });

  test("marks an evento as ready when every supported registration path has cupo de cronograma and precio", async () => {
    const event = await createSavedEvent("Final 2026");
    const jazz = await expectCreated(
      createModality(event.id, { name: "Jazz" }),
    );
    const inicial = await expectCreated(
      createExperienceLevel(event.id, { name: "Inicial" }),
    );

    await expectCreated(
      createSubmodality(event.id, {
        modalityId: jazz.id,
        name: "Lyrical",
      }),
    );
    await expectCreated(
      createCategory(event.id, {
        name: "Juvenil",
        minAge: 13,
        maxAge: 17,
        groupTypes: ["solo", "duo"],
        modalityIds: [jazz.id],
        experienceLevelIds: [inicial.id],
      }),
    );
    const block = await expectCreated(
      createSchedule(event.id, {
        name: "Domingo mañana",
        scheduledDate: "2026-06-07",
        startTime: "10:00",
        totalCapacity: 20,
        modalityIds: [jazz.id],
      }),
    );
    await expectCreated(
      createScheduleCapacity(block.id, {
        groupType: "solo",
        capacity: 6,
      }),
    );
    await expectCreated(
      createScheduleCapacity(block.id, {
        groupType: "duo",
        capacity: 6,
      }),
    );
    await expectCreated(
      createPrice(event.id, {
        groupType: "solo",
        amount: 14000,
        paymentDeadline: "2026-05-31",
        scheduleId: null,
      }),
    );
    await expectCreated(
      createPrice(event.id, {
        groupType: "duo",
        amount: 22000,
        paymentDeadline: "2026-05-31",
        scheduleId: null,
      }),
    );

    await expect(getEventRegistrationReadiness(event.id)).resolves.toEqual({
      eventId: event.id,
      isReady: true,
      missingItems: [],
    });
  });

  test("returns cached readiness until the event is marked dirty", async () => {
    const event = await createSavedEvent("Cacheado 2026");

    await db
      .update(events)
      .set({
        registrationReady: true,
        registrationReadinessMissingItems: [],
        registrationReadinessDirty: false,
        registrationReadinessCalculatedAt: new Date("2026-01-01T12:00:00Z"),
      })
      .where(eq(events.id, event.id));

    await expect(getEventRegistrationReadiness(event.id)).resolves.toEqual({
      eventId: event.id,
      isReady: true,
      missingItems: [],
    });

    await markEventRegistrationReadinessDirty(event.id);

    await expect(
      getEventRegistrationReadiness(event.id),
    ).resolves.toMatchObject({
      eventId: event.id,
      isReady: false,
      missingItems: expect.arrayContaining([
        expect.objectContaining({ code: "modalities" }),
        expect.objectContaining({ code: "categories" }),
      ]),
    });
    await expect(
      db.query.events.findFirst({
        columns: {
          registrationReady: true,
          registrationReadinessDirty: true,
          registrationReadinessCalculatedAt: true,
        },
        where: eq(events.id, event.id),
      }),
    ).resolves.toMatchObject({
      registrationReady: false,
      registrationReadinessDirty: false,
      registrationReadinessCalculatedAt: expect.any(Date),
    });
  });
});

async function createSavedEvent(name: string) {
  const result = await createEvent({
    name,
    registrationStartsAt: new Date("2026-03-01T12:00:00Z"),
    registrationEndsAt: new Date("2026-04-30T12:00:00Z"),
    startsAt: new Date("2026-05-01T12:00:00Z"),
    endsAt: new Date("2026-05-03T12:00:00Z"),
  });

  if (!result.ok) {
    throw new Error(result.error);
  }

  return result.event;
}

async function expectCreated(
  resultPromise: Promise<{
    ok: boolean;
    record?: { id: string };
  }>,
) {
  const result = await resultPromise;

  if (!result.ok || !result.record) {
    throw new Error("Expected event bases creation to succeed.");
  }

  return result.record;
}

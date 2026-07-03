import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { events } from "@/db/schema";
import { createCategory } from "@/lib/categories/repository.server";
import {
  createModality,
  createSubmodality,
} from "@/lib/modalities/repository.server";
import { createPrice } from "@/lib/prices/repository.server";
import {
  createSchedule,
  createScheduleCapacity,
} from "@/lib/schedules/repository.server";
import { fixedExperienceLevel } from "@/lib/events/bases-test-fixtures.server.db";
import { createEvent } from "@/lib/events/management.server";
import {
  getEventRegistrationReadiness,
  getEventRegistrationReadinessByEventId,
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
    const contemporaneo = await expectCreated(
      createModality(event.id, { name: "Contemporáneo" }),
    );
    const inicial = fixedExperienceLevel(event.id);

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
        experienceLevels: [inicial.id],
      }),
    );
    await expectCreated(
      createCategory(event.id, {
        name: "Juvenil",
        minAge: 13,
        maxAge: 17,
        groupTypes: ["solo"],
        modalityIds: [contemporaneo.id],
        experienceLevels: [],
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
    const inicial = fixedExperienceLevel(event.id);

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
        experienceLevels: [inicial.id],
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

  test("loads readiness for multiple eventos while recalculating dirty entries", async () => {
    const cachedReadyEvent = await createSavedEvent("Cache listo 2026");
    const dirtyEvent = await createSavedEvent("Dirty 2026");
    await createSavedEvent("No solicitado 2026");

    await db
      .update(events)
      .set({
        registrationReady: true,
        registrationReadinessMissingItems: [],
        registrationReadinessDirty: false,
        registrationReadinessCalculatedAt: new Date("2026-01-01T12:00:00Z"),
      })
      .where(eq(events.id, cachedReadyEvent.id));

    const readinessByEventId = await getEventRegistrationReadinessByEventId([
      cachedReadyEvent.id,
      dirtyEvent.id,
      cachedReadyEvent.id,
    ]);

    expect([...readinessByEventId.keys()].sort()).toEqual(
      [cachedReadyEvent.id, dirtyEvent.id].sort(),
    );
    expect(readinessByEventId.get(cachedReadyEvent.id)).toEqual({
      eventId: cachedReadyEvent.id,
      isReady: true,
      missingItems: [],
    });
    expect(readinessByEventId.get(dirtyEvent.id)).toMatchObject({
      eventId: dirtyEvent.id,
      isReady: false,
      missingItems: expect.arrayContaining([
        expect.objectContaining({ code: "modalities" }),
        expect.objectContaining({ code: "categories" }),
      ]),
    });
    await expect(
      db.query.events.findFirst({
        columns: {
          registrationReadinessDirty: true,
          registrationReadinessCalculatedAt: true,
        },
        where: eq(events.id, dirtyEvent.id),
      }),
    ).resolves.toMatchObject({
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

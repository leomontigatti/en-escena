import { eq } from "drizzle-orm";
import { describe, expect, test, vi } from "vitest";

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
import {
  createEventFixtureDates,
  createSavedEvent as createSavedEventFixture,
  expectCreated,
  fixedExperienceLevel,
} from "@/lib/events/bases-test-fixtures.server.db";
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
        paymentDeadline: "2099-12-31",
        scheduleId: null,
      }),
    );
    await expectCreated(
      createPrice(event.id, {
        groupType: "duo",
        amount: 22000,
        paymentDeadline: "2099-12-31",
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
        registrationReadinessCalculatedAt: new Date(),
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

  test("recalculates readiness cached on an earlier day even when it is not dirty", async () => {
    const event = await createSavedEvent("Vencido por fecha 2026");
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    await db
      .update(events)
      .set({
        registrationReady: true,
        registrationReadinessMissingItems: [],
        registrationReadinessDirty: false,
        registrationReadinessCalculatedAt: yesterday,
      })
      .where(eq(events.id, event.id));

    await expect(
      getEventRegistrationReadiness(event.id),
    ).resolves.toMatchObject({
      eventId: event.id,
      isReady: false,
      missingItems: expect.arrayContaining([
        expect.objectContaining({ code: "modalities" }),
      ]),
    });
  });

  // At 23:30 on the 31st in Córdoba (02:30 UTC on the 1st) the price expiring on
  // the 31st is still in force: readiness cannot announce the expiry three hours
  // before it happens for the academy.
  test("does not expire the day's price at 23:30 in Córdoba", async () => {
    const event = await createSavedEvent("Vence hoy 2026");
    const jazz = await expectCreated(
      createModality(event.id, { name: "Jazz" }),
    );
    const inicial = fixedExperienceLevel(event.id);

    await expectCreated(
      createCategory(event.id, {
        name: "Juvenil",
        minAge: 13,
        maxAge: 17,
        groupTypes: ["solo"],
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
      createScheduleCapacity(block.id, { groupType: "solo", capacity: 6 }),
    );
    await expectCreated(
      createPrice(event.id, {
        groupType: "solo",
        amount: 14000,
        paymentDeadline: "2026-05-31",
        scheduleId: null,
      }),
    );

    // Only `Date` is frozen: the database pool keeps using real timers.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-01T02:30:00Z"));

    try {
      await expect(getEventRegistrationReadiness(event.id)).resolves.toEqual({
        eventId: event.id,
        isReady: true,
        missingItems: [],
      });
    } finally {
      vi.useRealTimers();
    }
  });

  // The cache's stamp is compared against the business day: a readiness computed
  // at 23:00 on the 31st in Córdoba is already stale at 00:30 on the 1st, even
  // though both instants fall on the same UTC day.
  test("recomputes readiness sealed on the previous business day", async () => {
    const event = await createSavedEvent("Sello de ayer 2026");

    await db
      .update(events)
      .set({
        registrationReady: true,
        registrationReadinessMissingItems: [],
        registrationReadinessDirty: false,
        // 31/05 23:00 de Córdoba.
        registrationReadinessCalculatedAt: new Date("2026-06-01T02:00:00Z"),
      })
      .where(eq(events.id, event.id));

    vi.useFakeTimers({ toFake: ["Date"] });
    // 01/06 00:30 in Córdoba: the same UTC day as the stamp, a new business day.
    vi.setSystemTime(new Date("2026-06-01T03:30:00Z"));

    try {
      await expect(
        getEventRegistrationReadiness(event.id),
      ).resolves.toMatchObject({
        eventId: event.id,
        isReady: false,
        missingItems: expect.arrayContaining([
          expect.objectContaining({ code: "modalities" }),
        ]),
      });
    } finally {
      vi.useRealTimers();
    }
  });

  test("reports an expired precio as expired instead of missing", async () => {
    const event = await createSavedEvent("Precios vencidos 2026");
    const jazz = await expectCreated(
      createModality(event.id, { name: "Jazz" }),
    );

    await expectCreated(
      createCategory(event.id, {
        name: "Juvenil",
        minAge: 13,
        maxAge: 17,
        groupTypes: ["solo"],
        modalityIds: [jazz.id],
        experienceLevels: [],
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
      createScheduleCapacity(block.id, { groupType: "solo", capacity: 6 }),
    );
    await expectCreated(
      createPrice(event.id, {
        groupType: "solo",
        amount: 14000,
        paymentDeadline: "2020-01-31",
        scheduleId: null,
      }),
    );

    await expect(
      getEventRegistrationReadiness(event.id),
    ).resolves.toMatchObject({
      isReady: false,
      missingItems: [
        expect.objectContaining({
          code: "price-coverage",
          detail: expect.stringContaining("venció el 31 de enero de 2020"),
        }),
      ],
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
        registrationReadinessCalculatedAt: new Date(),
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
  return createSavedEventFixture(name, {
    dates: createEventFixtureDates(2026),
  });
}

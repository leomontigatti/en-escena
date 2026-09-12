import { eq } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { events } from "@/db/schema";
import { createCategory } from "@/lib/categories/repository.server";
import {
  createModality,
  createSubmodality,
} from "@/lib/modalities/repository.server";
import { resolveApplicableInscriptionPrice } from "@/lib/finances/inscription-price.server";
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

import { createSeminarRegistrationPrices } from "@/lib/seminar-prices/test-fixtures.server.db";
import { createSeminar } from "@/lib/seminars/repository.server";
import { defaultSeminarFacts } from "@/lib/test-support/seminars";
import { onBusinessDate } from "@/lib/shared/business-time-zone.test-support";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

afterEach(() => {
  vi.restoreAllMocks();
});

describe("event registration readiness", () => {
  test("reports missing compatible schedule capacities and applicable prices using the real `Bases del evento` rules", async () => {
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
        minAge: 1,
        maxAge: 100,
        groupTypes: ["solo", "duo"],
        modalityIds: [jazz.id],
        experienceLevels: [inicial.id],
      }),
    );
    await expectCreated(
      createCategory(event.id, {
        name: "Juvenil",
        minAge: 1,
        maxAge: 100,
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

  test("marks an event as ready when every registration path has schedule capacity and price, and keeps ignoring seminars", async () => {
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
        minAge: 1,
        maxAge: 100,
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
        paymentDeadline: null,
        scheduleId: null,
      }),
    );
    await expectCreated(
      createPrice(event.id, {
        groupType: "duo",
        amount: 22000,
        paymentDeadline: null,
        scheduleId: null,
      }),
    );

    // A seminar with no price list at all: readiness is about the
    // `Bases del evento`, and a seminar is not one of them
    // (docs/domain/seminars.md, "The seminar").
    const seminar = await createSeminar(event.id, {
      instructorName: "Abril Sosa",
      scheduledDate: "2026-06-08",
      startTime: "18:30",
      quota: 20,
      ...defaultSeminarFacts,
    });

    if (!seminar.ok) {
      throw new Error(seminar.error);
    }

    await expect(getEventRegistrationReadiness(event.id)).resolves.toEqual({
      eventId: event.id,
      isReady: true,
      missingItems: [],
    });

    await createSeminarRegistrationPrices(event.id);
    await markEventRegistrationReadinessDirty(event.id);

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
  test("does not report the day's price as expired at 23:30 in Córdoba", async () => {
    const event = await createSavedEvent("Vence hoy 2026");
    const jazz = await expectCreated(
      createModality(event.id, { name: "Jazz" }),
    );
    const inicial = fixedExperienceLevel(event.id);

    await expectCreated(
      createCategory(event.id, {
        name: "Juvenil",
        minAge: 1,
        maxAge: 100,
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
      await expect(
        getEventRegistrationReadiness(event.id),
      ).resolves.toMatchObject({
        eventId: event.id,
        isReady: false,
        missingItems: [
          expect.objectContaining({
            code: "price-coverage",
            detail: expect.stringContaining("vence el 31 de mayo de 2026"),
          }),
        ],
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
        // 31/05 23:00 in Córdoba.
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

  test("reports the last deadline and the affected path when no base price exists", async () => {
    const event = await createSavedEvent("Precios vencidos 2026");
    const jazz = await expectCreated(
      createModality(event.id, { name: "Jazz" }),
    );

    await expectCreated(
      createCategory(event.id, {
        name: "Juvenil",
        minAge: 1,
        maxAge: 100,
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
          detail:
            "El último precio general para Categoría Juvenil, Modalidad Jazz, Tipo de grupo Solo venció el 31 de enero de 2020 y no hay uno sin fecha límite.",
        }),
      ],
    });
  });

  test("becomes ready once a base price covers each reachable group type, and keeps resolving a price at any date", async () => {
    const event = await createSavedEvent("Precio base 2026");
    const jazz = await expectCreated(
      createModality(event.id, { name: "Jazz" }),
    );

    await expectCreated(
      createCategory(event.id, {
        name: "Juvenil",
        minAge: 1,
        maxAge: 100,
        groupTypes: ["solo", "duo"],
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
      createScheduleCapacity(block.id, { groupType: "duo", capacity: 6 }),
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

    await expect(
      getEventRegistrationReadiness(event.id),
    ).resolves.toMatchObject({ isReady: false });

    await expectCreated(
      createPrice(event.id, {
        groupType: "solo",
        amount: 18000,
        paymentDeadline: null,
        scheduleId: null,
      }),
    );
    await expectCreated(
      createPrice(event.id, {
        groupType: "duo",
        amount: 26000,
        paymentDeadline: null,
        scheduleId: null,
      }),
    );
    await markEventRegistrationReadinessDirty(event.id);

    await expect(getEventRegistrationReadiness(event.id)).resolves.toEqual({
      eventId: event.id,
      isReady: true,
      missingItems: [],
    });

    // The point of the check: no reachable path can fall into `missing-price`,
    // at any date the finance screens may ask for. A choreography with no
    // schedule of its own resolves through the general tier alone, so the null
    // scheduleId is part of the guarantee a general base price makes.
    for (const groupType of ["solo", "duo"]) {
      for (const businessDate of ["2026-05-01", "2030-01-01"]) {
        onBusinessDate(businessDate);
        for (const scheduleId of [block.id, null]) {
          await expect(
            resolveApplicableInscriptionPrice(db, {
              eventId: event.id,
              groupType,
              scheduleId,
            }),
          ).resolves.toMatchObject({ ok: true });
        }
      }
    }
  });

  test("rejects a schedule-specific base price without a general one", async () => {
    const event = await createSavedEvent("Precio base por cronograma 2026");
    const jazz = await expectCreated(
      createModality(event.id, { name: "Jazz" }),
    );

    await expectCreated(
      createCategory(event.id, {
        name: "Juvenil",
        minAge: 1,
        maxAge: 100,
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
        paymentDeadline: "2026-05-31",
        scheduleId: null,
      }),
    );
    await expectCreated(
      createPrice(event.id, {
        groupType: "solo",
        amount: 18000,
        paymentDeadline: null,
        scheduleId: block.id,
      }),
    );

    await expect(
      getEventRegistrationReadiness(event.id),
    ).resolves.toMatchObject({
      isReady: false,
      missingItems: [
        expect.objectContaining({
          code: "price-coverage",
          detail: expect.stringContaining(
            "venció el 31 de mayo de 2026 y no hay uno sin fecha límite",
          ),
        }),
      ],
    });

    // Why the schedule tier cannot stand alone: a caller with no schedule of
    // its own goes straight to the general tier, whose last row expired.
    onBusinessDate("2026-06-01");
    await expect(
      resolveApplicableInscriptionPrice(db, {
        eventId: event.id,
        groupType: "solo",
        scheduleId: null,
      }),
    ).resolves.toMatchObject({ ok: false, code: "missing-price" });
  });

  test("refuses an event whose category ladder leaves an age band uncovered", async () => {
    const event = await createSavedEvent("Escalera incompleta 2026");
    const acrobacias = await expectCreated(
      createModality(event.id, { name: "Acrobacias Aéreas" }),
    );

    await expectCreated(
      createCategory(event.id, {
        name: "Baby",
        minAge: 5,
        maxAge: 6,
        groupTypes: ["solo"],
        modalityIds: [acrobacias.id],
        experienceLevels: [],
      }),
    );
    await expectCreated(
      createCategory(event.id, {
        name: "Mayores",
        minAge: 7,
        maxAge: 100,
        groupTypes: ["solo"],
        modalityIds: [acrobacias.id],
        experienceLevels: [],
      }),
    );
    const block = await expectCreated(
      createSchedule(event.id, {
        name: "Domingo mañana",
        scheduledDate: "2026-06-07",
        startTime: "10:00",
        totalCapacity: 20,
        modalityIds: [acrobacias.id],
      }),
    );
    await expectCreated(
      createScheduleCapacity(block.id, { groupType: "solo", capacity: 6 }),
    );
    await expectCreated(
      createPrice(event.id, {
        groupType: "solo",
        amount: 14000,
        paymentDeadline: null,
        scheduleId: null,
      }),
    );

    await expect(
      getEventRegistrationReadiness(event.id),
    ).resolves.toMatchObject({
      isReady: false,
      missingItems: [
        expect.objectContaining({
          code: "age-coverage",
          detail:
            "Faltan categorías para Modalidad Acrobacias Aéreas, Tipo de grupo Solo: sin cobertura para las edades 1 a 4.",
        }),
      ],
    });
    await expect(
      db.query.events.findFirst({
        columns: { registrationReady: true },
        where: eq(events.id, event.id),
      }),
    ).resolves.toMatchObject({ registrationReady: false });
  });

  test("loads readiness for multiple events while recalculating dirty entries", async () => {
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

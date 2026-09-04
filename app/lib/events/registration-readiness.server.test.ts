import { describe, expect, test } from "vitest";

import type { EventBases } from "@/lib/events/bases.server";
import { getEventRegistrationReadinessForBases } from "@/lib/events/registration-readiness.server";

describe("event registration readiness from loaded bases", () => {
  test("resolves schedule compatibility and price coverage from the provided bases", async () => {
    const createdAt = new Date("2026-01-01T00:00:00Z");
    const eventBases = {
      modalities: [{ id: "modality_jazz", name: "Jazz" }],
      submodalities: [
        {
          id: "submodality_jazz_funk",
          name: "Jazz funk",
          modalityId: "modality_jazz",
        },
      ],
      categories: [
        {
          id: "category_infantil",
          name: "Infantil",
          minAge: 8,
          maxAge: 12,
          groupTypes: ["solo", "duo"],
          modalityIds: ["modality_jazz"],
          experienceLevels: ["amateur"],
        },
      ],
      schedules: [
        {
          id: "schedule_sabado",
          name: "Sábado mañana",
          scheduledDate: "2026-05-02",
          startTime: "09:00",
          totalCapacity: 20,
          createdAt,
          modalityIds: ["modality_jazz"],
          modalities: [{ id: "modality_jazz", name: "Jazz" }],
          availablePlaces: 8,
          occupiedCount: 12,
          scheduleCapacities: [
            {
              id: "capacity_solo",
              scheduleId: "schedule_sabado",
              groupType: "solo",
              capacity: 8,
              createdAt,
            },
            {
              id: "capacity_duo",
              scheduleId: "schedule_sabado",
              groupType: "duo",
              capacity: 4,
              createdAt,
            },
          ],
        },
      ],
      prices: [
        {
          id: "price_solo",
          eventId: "event_2026",
          groupType: "solo",
          amount: 14000,
          paymentDeadline: null,
          scheduleId: null,
          schedule: null,
        },
      ],
    } as unknown as EventBases;

    await expect(
      getEventRegistrationReadinessForBases("event_2026", eventBases, {
        referenceDate: "2026-05-01",
      }),
    ).resolves.toMatchObject({
      eventId: "event_2026",
      isReady: false,
      missingItems: [
        expect.objectContaining({
          code: "price-coverage",
          detail: expect.stringContaining("Tipo de grupo Dúo"),
        }),
      ],
    });
  });

  test("uses the schedule global capacity when no specific capacity exists for the group type", async () => {
    const createdAt = new Date("2026-01-01T00:00:00Z");
    const eventBases = {
      modalities: [{ id: "modality_jazz", name: "Jazz" }],
      submodalities: [],
      categories: [
        {
          id: "category_infantil",
          name: "Infantil",
          minAge: 8,
          maxAge: 12,
          groupTypes: ["solo"],
          modalityIds: ["modality_jazz"],
          experienceLevels: [],
        },
      ],
      schedules: [
        {
          id: "schedule_sabado",
          name: "Sábado mañana",
          scheduledDate: "2026-05-02",
          startTime: "09:00",
          totalCapacity: 20,
          createdAt,
          modalityIds: ["modality_jazz"],
          modalities: [{ id: "modality_jazz", name: "Jazz" }],
          availablePlaces: 20,
          occupiedCount: 0,
          scheduleCapacities: [],
        },
      ],
      prices: [
        {
          id: "price_solo",
          eventId: "event_2026",
          groupType: "solo",
          amount: 14000,
          paymentDeadline: null,
          scheduleId: null,
          schedule: null,
        },
      ],
    } as unknown as EventBases;

    await expect(
      getEventRegistrationReadinessForBases("event_2026", eventBases, {
        referenceDate: "2026-05-01",
      }),
    ).resolves.toMatchObject({
      eventId: "event_2026",
      isReady: true,
      missingItems: [],
    });
  });

  test("does not mark an event ready when every price for the path expired", async () => {
    const eventBases = buildSoloEventBases([
      {
        id: "price_solo",
        eventId: "event_2026",
        groupType: "solo",
        amount: 14000,
        paymentDeadline: "2026-05-31",
        scheduleId: null,
        schedule: null,
      },
    ]);

    await expect(
      getEventRegistrationReadinessForBases("event_2026", eventBases, {
        referenceDate: "2026-06-01",
      }),
    ).resolves.toMatchObject({
      eventId: "event_2026",
      isReady: false,
      missingItems: [
        expect.objectContaining({
          code: "price-coverage",
          detail:
            "El último precio para Categoría Infantil, Modalidad Jazz, Tipo de grupo Solo en el cronograma Sábado mañana venció el 31 de mayo de 2026 y no hay un precio base.",
        }),
      ],
    });
  });

  test("reports the latest deadline when several prices expired", async () => {
    const eventBases = buildSoloEventBases([
      {
        id: "price_solo_early",
        eventId: "event_2026",
        groupType: "solo",
        amount: 12000,
        paymentDeadline: "2026-03-31",
        scheduleId: null,
        schedule: null,
      },
      {
        id: "price_solo_late",
        eventId: "event_2026",
        groupType: "solo",
        amount: 14000,
        paymentDeadline: "2026-04-30",
        scheduleId: "schedule_sabado",
        schedule: null,
      },
    ]);

    await expect(
      getEventRegistrationReadinessForBases("event_2026", eventBases, {
        referenceDate: "2026-06-01",
      }),
    ).resolves.toMatchObject({
      isReady: false,
      missingItems: [
        expect.objectContaining({
          code: "price-coverage",
          detail: expect.stringContaining("venció el 30 de abril de 2026"),
        }),
      ],
    });
  });

  test("keeps the event ready when an expired price is covered by an open-ended one", async () => {
    const eventBases = buildSoloEventBases([
      {
        id: "price_solo_expired",
        eventId: "event_2026",
        groupType: "solo",
        amount: 12000,
        paymentDeadline: "2026-03-31",
        scheduleId: "schedule_sabado",
        schedule: null,
      },
      {
        id: "price_solo_open",
        eventId: "event_2026",
        groupType: "solo",
        amount: 18000,
        paymentDeadline: null,
        scheduleId: null,
        schedule: null,
      },
    ]);

    await expect(
      getEventRegistrationReadinessForBases("event_2026", eventBases, {
        referenceDate: "2026-06-01",
      }),
    ).resolves.toMatchObject({ isReady: true, missingItems: [] });
  });

  test("keeps reporting a missing price when no row covers the path at all", async () => {
    const eventBases = buildSoloEventBases([]);

    await expect(
      getEventRegistrationReadinessForBases("event_2026", eventBases, {
        referenceDate: "2026-06-01",
      }),
    ).resolves.toMatchObject({
      isReady: false,
      missingItems: expect.arrayContaining([
        expect.objectContaining({
          code: "price-coverage",
          detail: expect.stringContaining("Falta un precio aplicable"),
        }),
      ]),
    });
  });

  test("warns ahead of time when the only price for the path still applies but expires", async () => {
    const eventBases = buildSoloEventBases([
      {
        id: "price_solo",
        eventId: "event_2026",
        groupType: "solo",
        amount: 14000,
        paymentDeadline: "2026-05-31",
        scheduleId: null,
        schedule: null,
      },
    ]);

    await expect(
      getEventRegistrationReadinessForBases("event_2026", eventBases, {
        referenceDate: "2026-05-01",
      }),
    ).resolves.toMatchObject({
      isReady: false,
      missingItems: [
        expect.objectContaining({
          code: "price-coverage",
          detail:
            "El último precio para Categoría Infantil, Modalidad Jazz, Tipo de grupo Solo en el cronograma Sábado mañana vence el 31 de mayo de 2026 y no hay un precio base.",
        }),
      ],
    });
  });

  test("accepts a schedule-specific base price as the tail of its schedule", async () => {
    const eventBases = buildSoloEventBases([
      {
        id: "price_solo_general",
        eventId: "event_2026",
        groupType: "solo",
        amount: 12000,
        paymentDeadline: "2026-03-31",
        scheduleId: null,
        schedule: null,
      },
      {
        id: "price_solo_schedule_base",
        eventId: "event_2026",
        groupType: "solo",
        amount: 18000,
        paymentDeadline: null,
        scheduleId: "schedule_sabado",
        schedule: null,
      },
    ]);

    await expect(
      getEventRegistrationReadinessForBases("event_2026", eventBases, {
        referenceDate: "2026-06-01",
      }),
    ).resolves.toMatchObject({ isReady: true, missingItems: [] });
  });

  test("does not fall back to an expired general price when the specific one expired too", async () => {
    const eventBases = buildSoloEventBases([
      {
        id: "price_solo_schedule",
        eventId: "event_2026",
        groupType: "solo",
        amount: 12000,
        paymentDeadline: "2026-05-31",
        scheduleId: "schedule_sabado",
        schedule: null,
      },
      {
        id: "price_solo_general",
        eventId: "event_2026",
        groupType: "solo",
        amount: 18000,
        paymentDeadline: "2026-12-05",
        scheduleId: null,
        schedule: null,
      },
    ]);

    await expect(
      getEventRegistrationReadinessForBases("event_2026", eventBases, {
        referenceDate: "2026-12-06",
      }),
    ).resolves.toMatchObject({
      isReady: false,
      missingItems: [
        expect.objectContaining({
          code: "price-coverage",
          detail: expect.stringContaining(
            "venció el 5 de diciembre de 2026 y no hay un precio base",
          ),
        }),
      ],
    });
  });

  test("names the last date the path resolves, across both price tiers", async () => {
    const eventBases = buildSoloEventBases([
      {
        id: "price_solo_general",
        eventId: "event_2026",
        groupType: "solo",
        amount: 12000,
        paymentDeadline: "2026-01-31",
        scheduleId: null,
        schedule: null,
      },
      {
        id: "price_solo_schedule",
        eventId: "event_2026",
        groupType: "solo",
        amount: 18000,
        paymentDeadline: "2026-12-05",
        scheduleId: "schedule_sabado",
        schedule: null,
      },
    ]);

    await expect(
      getEventRegistrationReadinessForBases("event_2026", eventBases, {
        referenceDate: "2026-06-01",
      }),
    ).resolves.toMatchObject({
      isReady: false,
      missingItems: [
        expect.objectContaining({
          code: "price-coverage",
          detail: expect.stringContaining(
            "vence el 5 de diciembre de 2026 y no hay un precio base",
          ),
        }),
      ],
    });
  });
});

function buildSoloEventBases(prices: unknown[]) {
  const createdAt = new Date("2026-01-01T00:00:00Z");

  return {
    modalities: [{ id: "modality_jazz", name: "Jazz" }],
    submodalities: [],
    categories: [
      {
        id: "category_infantil",
        name: "Infantil",
        minAge: 8,
        maxAge: 12,
        groupTypes: ["solo"],
        modalityIds: ["modality_jazz"],
        experienceLevels: [],
      },
    ],
    schedules: [
      {
        id: "schedule_sabado",
        name: "Sábado mañana",
        scheduledDate: "2026-05-02",
        startTime: "09:00",
        totalCapacity: 20,
        createdAt,
        modalityIds: ["modality_jazz"],
        modalities: [{ id: "modality_jazz", name: "Jazz" }],
        availablePlaces: 20,
        occupiedCount: 0,
        scheduleCapacities: [],
      },
    ],
    prices,
  } as unknown as EventBases;
}

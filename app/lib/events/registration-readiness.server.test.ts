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
          experienceLevelIds: ["amateur"],
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
          occupiedCapacity: 12,
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
          paymentDeadline: "2026-05-31",
          scheduleId: null,
          schedule: null,
        },
      ],
    } as unknown as EventBases;

    await expect(
      getEventRegistrationReadinessForBases("event_2026", eventBases),
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

  test("uses the cronograma global capacity when no specific cupo exists for the group type", async () => {
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
          experienceLevelIds: [],
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
          occupiedCapacity: 0,
          scheduleCapacities: [],
        },
      ],
      prices: [
        {
          id: "price_solo",
          eventId: "event_2026",
          groupType: "solo",
          amount: 14000,
          paymentDeadline: "2026-05-31",
          scheduleId: null,
          schedule: null,
        },
      ],
    } as unknown as EventBases;

    await expect(
      getEventRegistrationReadinessForBases("event_2026", eventBases),
    ).resolves.toMatchObject({
      eventId: "event_2026",
      isReady: true,
      missingItems: [],
    });
  });
});

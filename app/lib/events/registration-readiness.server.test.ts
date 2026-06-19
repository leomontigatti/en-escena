import { describe, expect, test } from "vitest";

import type { EventBases } from "@/lib/events/bases.server";
import { getEventRegistrationReadinessForBases } from "@/lib/events/registration-readiness.server";

describe("event registration readiness from loaded bases", () => {
  test("resolves schedule compatibility and price coverage from the provided bases", async () => {
    const eventBases = {
      modalities: [{ id: "modality_jazz", name: "Jazz" }],
      submodalities: [
        {
          id: "submodality_jazz_funk",
          name: "Jazz funk",
          modalityId: "modality_jazz",
        },
      ],
      experienceLevels: [{ id: "level_inicial", name: "Inicial" }],
      categories: [
        {
          id: "category_infantil",
          name: "Infantil",
          minAge: 8,
          maxAge: 12,
          groupTypes: ["solo", "duo"],
          modalityIds: ["modality_jazz"],
          experienceLevelIds: ["level_inicial"],
        },
      ],
      schedules: [
        {
          id: "schedule_sabado",
          name: "Sábado mañana",
          scheduledDate: "2026-05-02",
          startTime: "09:00",
          totalCapacity: 20,
          modalityIds: ["modality_jazz"],
          modalities: [{ id: "modality_jazz", name: "Jazz" }],
          occupiedCapacity: 12,
          scheduleCapacities: [
            {
              id: "capacity_solo",
              scheduleId: "schedule_sabado",
              groupType: "solo",
              capacity: 8,
            },
            {
              id: "capacity_duo",
              scheduleId: "schedule_sabado",
              groupType: "duo",
              capacity: 4,
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
    } as EventBases;

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
});

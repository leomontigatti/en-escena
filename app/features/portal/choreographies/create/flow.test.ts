import { describe, expect, test } from "vitest";

import {
  getCreateChoreographySteps,
  getFirstPostResolutionStepIndex,
} from "@/features/portal/choreographies/create/flow";

describe("choreography create flow helpers", () => {
  test("keeps the expected step order and first post-resolution step", () => {
    const resolution = {
      categoryAgeBasis: 14,
      category: {
        status: "resolved" as const,
        id: "category_1",
        name: "Juvenil",
      },
      categoryCalculationMode: "oldest" as const,
      dancers: [
        {
          id: "dancer_1",
          firstName: "Ana",
          lastName: "Paz",
          birthDate: "2014-07-01",
          ageAtEventStart: 11,
        },
      ],
      experienceLevel: {
        required: true,
        options: [{ id: "level_1", name: "Inicial" }],
      },
      groupType: "solo" as const,
      schedule: {
        status: "multiple" as const,
        canConfirm: true as const,
        options: [
          {
            id: "capacity_1",
            scheduleId: "schedule_1",
            scheduleCapacityId: "capacity_1",
            capacity: 8,
            groupType: "solo" as const,
            usesGlobalCapacity: false,
            schedule: {
              id: "schedule_1",
              name: "Domingo mañana",
              scheduledDate: "2026-05-03",
              startTime: "10:00",
            },
          },
        ],
      },
    };

    expect(
      getCreateChoreographySteps({
        canChooseSubmodality: true,
        resolution,
      }),
    ).toEqual([
      "name",
      "modality",
      "submodality",
      "dancers",
      "experienceLevel",
      "schedule",
      "professors",
      "summary",
    ]);

    expect(
      getFirstPostResolutionStepIndex({
        canChooseSubmodality: true,
        resolution,
      }),
    ).toBe(4);
  });
});

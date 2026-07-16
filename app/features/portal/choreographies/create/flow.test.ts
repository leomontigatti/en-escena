import { describe, expect, test } from "vitest";

import {
  createChoreographySchema,
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
        required: true as const,
        options: [{ id: "amateur" as const, name: "Amateur" }],
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

  test("requires at least one professor", () => {
    const result = createChoreographySchema.safeParse({
      name: "Danza de la Luna",
      modalityId: "modality_1",
      submodalityId: "",
      dancerIds: ["dancer_1"],
      professorIds: [],
      experienceLevelId: "",
      scheduleCapacityId: "",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "Este campo es obligatorio.",
          path: ["professorIds"],
        }),
      ]),
    );
  });

  test("rejects placeholder-only choreography names", () => {
    const result = createChoreographySchema.safeParse({
      name: "-",
      modalityId: "modality_1",
      submodalityId: "",
      dancerIds: ["dancer_1"],
      professorIds: ["professor_1"],
      experienceLevelId: "",
      scheduleCapacityId: "",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "Ingresá un nombre válido para la coreografía.",
          path: ["name"],
        }),
      ]),
    );
  });
});

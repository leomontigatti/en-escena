import { describe, expect, test } from "vitest";

import {
  canAdvanceFromScheduleStep,
  createChoreographySchema,
  getCreateChoreographySteps,
  getFirstPostResolutionStepIndex,
  type RegistrationResolution,
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
            isFull: false,
            label: "3 de mayo de 2026 - 10:00 hs. · 2/8 ocupados",
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

describe("choreography schedule step advance rule", () => {
  test("advances once a cupo with room is chosen", () => {
    expect(
      canAdvanceFromScheduleStep({
        resolution: buildScheduleResolution([
          { id: "capacity_1", isFull: true },
          { id: "capacity_2", isFull: false },
        ]),
        selectedScheduleCapacityId: "capacity_2",
      }),
    ).toBe(true);

    expect(
      canAdvanceFromScheduleStep({
        resolution: buildScheduleResolution([
          { id: "capacity_1", isFull: true },
          { id: "capacity_2", isFull: false },
        ]),
        selectedScheduleCapacityId: "",
      }),
    ).toBe(false);
  });

  // The step shows the notice instead of the select, so there is nothing to
  // choose: the footer's action cannot stay enabled, not even with an earlier
  // choice that has since run out of room.
  test("blocks the step while every compatible cupo is full", () => {
    const resolution = buildScheduleResolution([
      { id: "capacity_1", isFull: true },
      { id: "capacity_2", isFull: true },
    ]);

    expect(
      canAdvanceFromScheduleStep({
        resolution,
        selectedScheduleCapacityId: "",
      }),
    ).toBe(false);

    expect(
      canAdvanceFromScheduleStep({
        resolution,
        selectedScheduleCapacityId: "capacity_2",
      }),
    ).toBe(false);
  });
});

function buildScheduleResolution(
  options: { id: string; isFull: boolean }[],
): RegistrationResolution {
  return {
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
        ageAtEventStart: 14,
      },
    ],
    experienceLevel: {
      required: false as const,
      options: [],
    },
    groupType: "solo" as const,
    schedule: {
      status: "multiple" as const,
      canConfirm: true as const,
      options: options.map((option) => ({
        ...option,
        label: "3 de mayo de 2026 - 10:00 hs.",
        scheduleId: `schedule_${option.id}`,
        scheduleCapacityId: option.id,
        capacity: 8,
        groupType: "solo" as const,
        usesGlobalCapacity: false,
        schedule: {
          id: `schedule_${option.id}`,
          name: "Domingo mañana",
          scheduledDate: "2026-05-03",
          startTime: "10:00",
        },
      })),
    },
  };
}

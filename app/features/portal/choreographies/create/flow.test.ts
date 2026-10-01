import { describe, expect, test } from "vitest";

import {
  applyRegistrationResolution,
  clampCreateChoreographyStep,
  createChoreographyStepSlugs,
  readCreateChoreographyStep,
  restoreCreateChoreographyAnswers,
  canAdvanceFromScheduleStep,
  canAdvanceFromStep,
  CREATE_CHOREOGRAPHY_INTENT,
  createChoreographySchema,
  getCreateChoreographySteps,
  getOnlyOptionId,
  buildCreateChoreographyFormData,
  getSubmissionError,
  getSubmissionWarning,
  type CreateActionData,
  type RegistrationResolution,
  resolvePortalRegistrationCategory,
} from "@/features/portal/choreographies/create/flow";

describe("choreography create flow helpers", () => {
  test("asks the category step only once a resolution gives a level or a schedule to choose", () => {
    const multipleSchedules = buildScheduleResolution([
      { id: "capacity_1", isFull: false },
      { id: "capacity_2", isFull: false },
    ]);
    const onlySchedule = buildAutoScheduleResolution();

    expect(getCreateChoreographySteps({ resolution: null })).toEqual([
      "choreography",
      "dancers",
      "professors",
      "summary",
    ]);
    expect(
      getCreateChoreographySteps({ resolution: multipleSchedules }),
    ).toEqual(["choreography", "dancers", "category", "professors", "summary"]);
    expect(
      getCreateChoreographySteps({
        resolution: {
          ...onlySchedule,
          experienceLevel: {
            required: true,
            options: [{ id: "amateur", name: "Amateur" }],
          },
        },
      }),
    ).toEqual(["choreography", "dancers", "category", "professors", "summary"]);
    expect(getCreateChoreographySteps({ resolution: onlySchedule })).toEqual([
      "choreography",
      "dancers",
      "professors",
      "summary",
    ]);
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

describe("canAdvanceFromStep", () => {
  const values = {
    name: "Danza de la Luna",
    modalityId: "modality_1",
    submodalityId: "",
    dancerIds: ["dancer_1"],
    professorIds: ["professor_1"],
    experienceLevelId: "",
    scheduleCapacityId: "",
  };

  test("asks the first step for a valid name, a modality and, when it has any, a submodality", () => {
    const input = { canChooseSubmodality: false, resolution: null, values };

    expect(canAdvanceFromStep("choreography", input)).toBe(true);
    expect(
      canAdvanceFromStep("choreography", {
        ...input,
        values: { ...values, name: "-" },
      }),
    ).toBe(false);
    expect(
      canAdvanceFromStep("choreography", {
        ...input,
        values: { ...values, modalityId: "" },
      }),
    ).toBe(false);
    expect(
      canAdvanceFromStep("choreography", {
        ...input,
        canChooseSubmodality: true,
      }),
    ).toBe(false);
    expect(
      canAdvanceFromStep("choreography", {
        ...input,
        canChooseSubmodality: true,
        values: { ...values, submodalityId: "submodality_1" },
      }),
    ).toBe(true);
  });

  test("asks for at least one dancer and one professor", () => {
    const input = { canChooseSubmodality: false, resolution: null, values };

    expect(canAdvanceFromStep("dancers", input)).toBe(true);
    expect(
      canAdvanceFromStep("dancers", {
        ...input,
        values: { ...values, dancerIds: [] },
      }),
    ).toBe(false);
    expect(canAdvanceFromStep("professors", input)).toBe(true);
    expect(
      canAdvanceFromStep("professors", {
        ...input,
        values: { ...values, professorIds: [] },
      }),
    ).toBe(false);
  });

  test("asks the category step for the level it requires and a schedule with room", () => {
    const resolution: RegistrationResolution = {
      ...buildScheduleResolution([
        { id: "capacity_1", isFull: true },
        { id: "capacity_2", isFull: false },
      ]),
      experienceLevel: {
        required: true,
        options: [{ id: "amateur", name: "Amateur" }],
      },
    };
    const input = { canChooseSubmodality: false, resolution, values };

    expect(
      canAdvanceFromStep("category", {
        ...input,
        values: {
          ...values,
          experienceLevelId: "amateur",
          scheduleCapacityId: "capacity_2",
        },
      }),
    ).toBe(true);
    expect(
      canAdvanceFromStep("category", {
        ...input,
        values: { ...values, scheduleCapacityId: "capacity_2" },
      }),
    ).toBe(false);
    expect(
      canAdvanceFromStep("category", {
        ...input,
        values: { ...values, experienceLevelId: "amateur" },
      }),
    ).toBe(false);
    expect(canAdvanceFromStep("category", { ...input, resolution: null })).toBe(
      false,
    );
  });
});

describe("getOnlyOptionId", () => {
  test("names the option when it is the only one, and nothing otherwise", () => {
    expect(getOnlyOptionId([{ id: "modality_1" }])).toBe("modality_1");
    expect(getOnlyOptionId([{ id: "modality_1" }, { id: "modality_2" }])).toBe(
      "",
    );
    expect(getOnlyOptionId([])).toBe("");
  });
});

describe("choreography schedule step advance rule", () => {
  test("advances once a capacity with room is chosen", () => {
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
  test("blocks the step while every compatible capacity is full", () => {
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

function buildAutoScheduleResolution(): RegistrationResolution {
  const onlyOption = buildScheduleResolution([
    { id: "capacity_1", isFull: false },
  ]).schedule.options.at(0);

  if (!onlyOption) {
    throw new Error("The fixture builds one schedule option.");
  }

  return {
    ...buildScheduleResolution([]),
    schedule: {
      status: "auto",
      canConfirm: true,
      scheduleCapacityId: "capacity_1",
      options: [onlyOption],
    },
  };
}

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

describe("getSubmissionError", () => {
  test("reads the refusal the create action returned", () => {
    expect(
      getSubmissionError({
        intent: CREATE_CHOREOGRAPHY_INTENT,
        result: {
          ok: false,
          code: "invalid-name",
          error: "Ese nombre ya está en uso.",
        },
      }),
    ).toBe("Ese nombre ya está en uso.");
  });

  test("surfaces an unexpected failure so the wizard stays open", () => {
    expect(
      getSubmissionError({
        status: "error",
        message: "No pudimos completar la acción. Intentá nuevamente.",
      }),
    ).toBe("No pudimos completar la acción. Intentá nuevamente.");
  });

  test("reports no error while there is no submission yet", () => {
    expect(getSubmissionError(undefined)).toBeNull();
  });

  test("leaves the duplicate refusal to the warning, so it is not shown as an error", () => {
    expect(getSubmissionError(duplicateChoreographyActionData())).toBeNull();
  });
});

describe("getSubmissionWarning", () => {
  test("carries the pieces the academy already registered and the ids to acknowledge", () => {
    expect(getSubmissionWarning(duplicateChoreographyActionData())).toEqual({
      matchIds: ["choreography_1"],
      matches: [
        { choreographyNumber: 7, id: "choreography_1", name: "Luna Llena" },
      ],
    });
  });

  test("reports no warning for any other refusal", () => {
    expect(
      getSubmissionWarning({
        intent: CREATE_CHOREOGRAPHY_INTENT,
        result: {
          ok: false,
          code: "invalid-name",
          error: "Ese nombre ya está en uso.",
        },
      }),
    ).toBeNull();
    expect(getSubmissionWarning(undefined)).toBeNull();
  });
});

describe("buildCreateChoreographyFormData", () => {
  test("carries the acknowledged duplicate ids on the second submit", () => {
    const formData = buildCreateChoreographyFormData({
      acknowledgedDuplicateIds: ["choreography_1"],
      eventId: "event_1",
      name: "Luna Llena",
      modalityId: "modality_1",
      submodalityId: "",
      canChooseSubmodality: false,
      dancerIds: ["dancer_1"],
      professorIds: ["professor_1"],
      experienceLevelId: "",
      scheduleCapacityId: "capacity_1",
    });

    expect(formData.getAll("acknowledgedDuplicateIds")).toEqual([
      "choreography_1",
    ]);
  });

  test("sends no acknowledgement on the first submit", () => {
    const formData = buildCreateChoreographyFormData({
      eventId: "event_1",
      name: "Luna Llena",
      modalityId: "modality_1",
      submodalityId: "",
      canChooseSubmodality: false,
      dancerIds: ["dancer_1"],
      professorIds: ["professor_1"],
      experienceLevelId: "",
      scheduleCapacityId: "capacity_1",
    });

    expect(formData.getAll("acknowledgedDuplicateIds")).toEqual([]);
  });
});

function duplicateChoreographyActionData(): CreateActionData {
  return {
    intent: CREATE_CHOREOGRAPHY_INTENT,
    result: {
      ok: false as const,
      code: "duplicate-choreography" as const,
      error:
        "Ya existe una coreografía con el mismo nombre y los mismos bailarines en este evento: Luna Llena.",
      warning: {
        kind: "choreography-cast" as const,
        matches: [
          { id: "choreography_1", choreographyNumber: 7, name: "Luna Llena" },
        ],
      },
    },
  };
}

describe("resolvePortalRegistrationCategory", () => {
  test("refuses a resolution with no compatible category, naming the modality and the group type", () => {
    const resolution = buildScheduleResolution([
      { id: "capacity_1", isFull: false },
    ]);

    expect(
      resolvePortalRegistrationCategory({
        resolution: {
          ...resolution,
          groupType: "trio",
          category: { status: "pending", reason: "no-compatible-category" },
        },
        modalityName: "Jazz",
      }),
    ).toEqual({
      refused: true,
      message:
        "No hay una categoría de Jazz para Trío con las edades de estos bailarines. Revisá los bailarines o la modalidad.",
    });
  });

  test("hands the wizard a resolution whose category is resolved", () => {
    const resolution = buildScheduleResolution([
      { id: "capacity_1", isFull: false },
    ]);

    expect(
      resolvePortalRegistrationCategory({ resolution, modalityName: "Jazz" }),
    ).toEqual({ refused: false, resolution });
  });
});

describe("applyRegistrationResolution", () => {
  const answers = {
    experienceLevelId: "amateur",
    modalityName: "Jazz",
    scheduleCapacityId: "capacity_2",
  };

  test("refuses with the server's message when the resolution failed", () => {
    expect(
      applyRegistrationResolution({
        ...answers,
        result: {
          ok: false,
          code: "event-not-found",
          error: "No encontramos el evento.",
        },
      }),
    ).toEqual({ status: "refused", message: "No encontramos el evento." });
  });

  test("refuses when no category fits the dancers", () => {
    const resolution = buildScheduleResolution([
      { id: "capacity_1", isFull: false },
    ]);

    expect(
      applyRegistrationResolution({
        ...answers,
        result: {
          ok: true,
          resolution: {
            ...resolution,
            category: { status: "pending", reason: "no-compatible-category" },
          },
        },
      }),
    ).toMatchObject({ status: "refused" });
  });

  test("refuses with the schedule's message when no schedule takes the choreography", () => {
    const resolution = buildScheduleResolution([]);

    expect(
      applyRegistrationResolution({
        ...answers,
        result: {
          ok: true,
          resolution: {
            ...resolution,
            schedule: {
              status: "none",
              canConfirm: false,
              error: "No hay cronogramas con inscripciones abiertas.",
              options: [],
            },
          },
        },
      }),
    ).toEqual({
      status: "refused",
      message: "No hay cronogramas con inscripciones abiertas.",
    });
  });

  test("keeps the level and schedule already chosen while the new resolution still offers them", () => {
    const resolution = buildScheduleResolution([
      { id: "capacity_1", isFull: false },
      { id: "capacity_2", isFull: false },
    ]);

    expect(
      applyRegistrationResolution({
        ...answers,
        result: {
          ok: true,
          resolution: {
            ...resolution,
            experienceLevel: {
              required: true,
              options: [{ id: "amateur", name: "Amateur" }],
            },
          },
        },
      }),
    ).toMatchObject({
      status: "resolved",
      experienceLevelId: "amateur",
      scheduleCapacityId: "capacity_2",
    });
  });

  test("drops the level and schedule the new resolution no longer offers", () => {
    const resolution = buildScheduleResolution([
      { id: "capacity_1", isFull: false },
    ]);

    expect(
      applyRegistrationResolution({
        ...answers,
        result: {
          ok: true,
          resolution: {
            ...resolution,
            experienceLevel: {
              required: true,
              options: [{ id: "elite", name: "Elite" }],
            },
          },
        },
      }),
    ).toMatchObject({
      status: "resolved",
      experienceLevelId: "",
      scheduleCapacityId: "",
    });
  });

  test("drops the level when the category requires none, and takes the only schedule", () => {
    const resolution = buildScheduleResolution([]);
    const onlyOption = buildScheduleResolution([
      { id: "capacity_9", isFull: false },
    ]).schedule.options.at(0);

    if (!onlyOption) {
      throw new Error("The fixture builds one schedule option.");
    }

    expect(
      applyRegistrationResolution({
        ...answers,
        result: {
          ok: true,
          resolution: {
            ...resolution,
            schedule: {
              status: "auto",
              canConfirm: true,
              scheduleCapacityId: "capacity_9",
              options: [onlyOption],
            },
          },
        },
      }),
    ).toMatchObject({
      status: "resolved",
      experienceLevelId: "",
      scheduleCapacityId: "capacity_9",
    });
  });
});

describe("the wizard step in the URL", () => {
  test("reads each step from its Spanish slug, and anything else as the first step", () => {
    expect(readCreateChoreographyStep("bailarines")).toBe("dancers");
    expect(readCreateChoreographyStep("categoria")).toBe("category");
    expect(readCreateChoreographyStep("profesores")).toBe("professors");
    expect(readCreateChoreographyStep("resumen")).toBe("summary");
    expect(readCreateChoreographyStep(null)).toBe("choreography");
    expect(readCreateChoreographyStep("otra-cosa")).toBe("choreography");
    expect(createChoreographyStepSlugs.dancers).toBe("bailarines");
  });
});

describe("restoreCreateChoreographyAnswers", () => {
  const options = {
    activeDancers: [{ id: "dancer_1" }, { id: "dancer_2" }],
    activeProfessors: [{ id: "professor_1" }],
    registrationBaseOptions: {
      modalities: [{ id: "modality_1", name: "Jazz" }],
      submodalities: [
        { id: "submodality_1", modalityId: "modality_1", name: "Lírico" },
      ],
    },
  };

  test("keeps the answers the page still offers", () => {
    const stored = {
      name: "Danza de la Luna",
      modalityId: "modality_1",
      submodalityId: "submodality_1",
      dancerIds: ["dancer_2"],
      professorIds: ["professor_1"],
      experienceLevelId: "amateur",
      scheduleCapacityId: "capacity_1",
    };

    expect(restoreCreateChoreographyAnswers(stored, options)).toEqual(stored);
  });

  test("drops the people, modality and submodality no longer offered", () => {
    expect(
      restoreCreateChoreographyAnswers(
        {
          name: "Danza de la Luna",
          modalityId: "modality_gone",
          submodalityId: "submodality_1",
          dancerIds: ["dancer_1", "dancer_inactive"],
          professorIds: ["professor_gone"],
          experienceLevelId: "",
          scheduleCapacityId: "",
        },
        options,
      ),
    ).toEqual({
      name: "Danza de la Luna",
      modalityId: "",
      submodalityId: "",
      dancerIds: ["dancer_1"],
      professorIds: [],
      experienceLevelId: "",
      scheduleCapacityId: "",
    });
  });

  test("gives nothing back for a value that is not the wizard's answers", () => {
    expect(restoreCreateChoreographyAnswers(null, options)).toBeNull();
    expect(restoreCreateChoreographyAnswers("texto", options)).toBeNull();
    expect(
      restoreCreateChoreographyAnswers({ name: 3, dancerIds: "x" }, options),
    ).toBeNull();
  });
});

describe("clampCreateChoreographyStep", () => {
  const complete = {
    name: "Danza de la Luna",
    modalityId: "modality_1",
    submodalityId: "",
    dancerIds: ["dancer_1"],
    professorIds: ["professor_1"],
    experienceLevelId: "",
    scheduleCapacityId: "",
  };

  test("lands on the first step whose answers are incomplete", () => {
    expect(
      clampCreateChoreographyStep({
        canChooseSubmodality: false,
        resolution: null,
        step: "summary",
        values: { ...complete, dancerIds: [] },
      }),
    ).toBe("dancers");
    expect(
      clampCreateChoreographyStep({
        canChooseSubmodality: false,
        resolution: null,
        step: "dancers",
        values: { ...complete, name: "" },
      }),
    ).toBe("choreography");
  });

  test("keeps the step when everything before it is answered", () => {
    expect(
      clampCreateChoreographyStep({
        canChooseSubmodality: false,
        resolution: buildAutoScheduleResolution(),
        step: "summary",
        values: complete,
      }),
    ).toBe("summary");
  });

  test("stops on the category step while the resolution leaves it unanswered", () => {
    expect(
      clampCreateChoreographyStep({
        canChooseSubmodality: false,
        resolution: buildScheduleResolution([
          { id: "capacity_1", isFull: false },
          { id: "capacity_2", isFull: false },
        ]),
        step: "summary",
        values: complete,
      }),
    ).toBe("category");
  });

  test("moves past a category step the resolution no longer has", () => {
    expect(
      clampCreateChoreographyStep({
        canChooseSubmodality: false,
        resolution: buildAutoScheduleResolution(),
        step: "category",
        values: complete,
      }),
    ).toBe("professors");
  });
});

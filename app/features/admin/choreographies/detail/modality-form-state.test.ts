import { describe, expect, test } from "vitest";

import type { ChoreographyModalityResolution } from "./modality.server";
import {
  canSubmitModalityCorrection,
  getModalitySelectOptions,
  getResolvedModalityFieldState,
  isModalityScheduleCapacityLocked,
  shouldResolveModalitySelection,
} from "./modality-form-state";

describe("getModalitySelectOptions", () => {
  test("offers every modality of the event, current one included", () => {
    expect(
      getModalitySelectOptions([
        { hasCompatibleScheduleCapacity: true, id: "jazz", name: "Jazz" },
        { hasCompatibleScheduleCapacity: true, id: "urbano", name: "Urbano" },
      ]),
    ).toEqual([
      { disabled: false, label: "Jazz", value: "jazz" },
      { disabled: false, label: "Urbano", value: "urbano" },
    ]);
  });

  test("disables a modality no cronograma accepts and says so on the option", () => {
    expect(
      getModalitySelectOptions([
        {
          hasCompatibleScheduleCapacity: false,
          id: "folclore",
          name: "Folclore",
        },
      ]),
    ).toEqual([
      {
        disabled: true,
        label: "Folclore (sin cronograma compatible)",
        value: "folclore",
      },
    ]);
  });
});

describe("shouldResolveModalitySelection", () => {
  test("asks the server once for a newly picked modality", () => {
    expect(shouldResolveModalitySelection(buildInput())).toBe(true);
  });

  test.each([
    ["the field is read-only", { canCorrectModality: false }],
    ["the selection is the persisted one", { selectedModalityId: "jazz" }],
    ["that selection is already resolved", { resolvedModalityId: "urbano" }],
    ["that selection is already in flight", { submittedModalityId: "urbano" }],
  ])("does not ask again when %s", (_cause, overrides) => {
    expect(shouldResolveModalitySelection(buildInput(overrides))).toBe(false);
  });

  function buildInput(
    overrides: Partial<
      Parameters<typeof shouldResolveModalitySelection>[0]
    > = {},
  ) {
    return {
      canCorrectModality: true,
      persistedModalityId: "jazz",
      resolvedModalityId: "",
      selectedModalityId: "urbano",
      submittedModalityId: null,
      ...overrides,
    };
  }
});

describe("getResolvedModalityFieldState", () => {
  test("never carries the submodality over to the destination modality", () => {
    const state = getResolvedModalityFieldState({
      categoryId: "juvenil",
      experienceLevelId: "amateur",
      resolution: buildResolution(),
      watchedScheduleCapacityId: "",
    });

    expect(state.nextSubmodalityId).toBe("");
  });

  test("keeps the assigned level when the resolved category is unchanged", () => {
    const state = getResolvedModalityFieldState({
      categoryId: "juvenil",
      experienceLevelId: "amateur",
      resolution: buildResolution({
        category: { id: "juvenil", name: "Juvenil" },
        experienceLevel: {
          options: [{ id: "amateur", name: "Amateur" }],
          required: true,
        },
      }),
      watchedScheduleCapacityId: "",
    });

    expect(state.nextExperienceLevelId).toBe("amateur");
  });

  test("clears the assigned level when the resolved category changes", () => {
    const state = getResolvedModalityFieldState({
      categoryId: "juvenil",
      experienceLevelId: "amateur",
      resolution: buildResolution({
        category: { id: "adultos", name: "Adultos" },
        experienceLevel: {
          options: [{ id: "amateur", name: "Amateur" }],
          required: true,
        },
      }),
      watchedScheduleCapacityId: "",
    });

    expect(state.nextExperienceLevelId).toBe("");
  });

  test("preselects the only compatible cupo", () => {
    const state = getResolvedModalityFieldState({
      categoryId: "juvenil",
      experienceLevelId: null,
      resolution: buildResolution(),
      watchedScheduleCapacityId: "",
    });

    expect(state.nextScheduleCapacityId).toBe("cupo_1");
  });

  test("keeps a still-offered cupo and drops one the destination no longer has", () => {
    const resolution = buildResolution({
      scheduleCapacity: {
        options: [
          { id: "cupo_2", isFull: false, label: "2 de mayo" },
          { id: "cupo_3", isFull: true, label: "3 de mayo" },
        ],
        status: "multiple",
      },
    });

    expect(
      getResolvedModalityFieldState({
        categoryId: "juvenil",
        experienceLevelId: null,
        resolution,
        watchedScheduleCapacityId: "cupo_2",
      }).nextScheduleCapacityId,
    ).toBe("cupo_2");
    expect(
      getResolvedModalityFieldState({
        categoryId: "juvenil",
        experienceLevelId: null,
        resolution,
        watchedScheduleCapacityId: "cupo_1",
      }).nextScheduleCapacityId,
    ).toBe("");
  });
});

describe("isModalityScheduleCapacityLocked", () => {
  test("locks the cupo when the destination modality resolves exactly one", () => {
    expect(isModalityScheduleCapacityLocked(buildResolution())).toBe(true);
  });

  test("leaves the cupo open when the destination modality offers several", () => {
    expect(
      isModalityScheduleCapacityLocked(
        buildResolution({
          scheduleCapacity: {
            options: [
              { id: "cupo_1", isFull: false, label: "1 de mayo" },
              { id: "cupo_2", isFull: false, label: "2 de mayo" },
            ],
            status: "multiple",
          },
        }),
      ),
    ).toBe(false);
  });
});

describe("canSubmitModalityCorrection", () => {
  test("saves a resolved correction that has everything it needs", () => {
    expect(canSubmitModalityCorrection(buildInput())).toBe(true);
  });

  test.each([
    ["nothing changed", { selectedModalityId: "jazz" }],
    ["the resolution is still in flight", { isResolving: true }],
    ["the save is in flight", { isSubmitting: true }],
    ["the field is read-only", { canCorrectModality: false }],
    ["the resolution is for another modality", { resolvedModalityId: "otra" }],
    ["there is no resolution yet", { resolution: null }],
  ])("blocks the save when %s", (_cause, overrides) => {
    expect(canSubmitModalityCorrection(buildInput(overrides))).toBe(false);
  });

  test("blocks the save while a required submodality is missing", () => {
    expect(
      canSubmitModalityCorrection(
        buildInput({
          resolution: buildResolution({
            submodality: {
              options: [{ id: "hip-hop", name: "Hip hop" }],
              required: true,
            },
          }),
          watchedSubmodalityId: "",
        }),
      ),
    ).toBe(false);
  });

  test("blocks the save while a required level is missing", () => {
    expect(
      canSubmitModalityCorrection(
        buildInput({
          resolution: buildResolution({
            experienceLevel: {
              options: [{ id: "amateur", name: "Amateur" }],
              required: true,
            },
          }),
          watchedExperienceLevelId: "",
        }),
      ),
    ).toBe(false);
  });

  // A destination modalidad with no compatible categoría saves all the same:
  // the choreography stays operationally incomplete, as it does on creation.
  test("saves when no category resolves for the destination modality", () => {
    expect(
      canSubmitModalityCorrection(
        buildInput({ resolution: buildResolution({ category: null }) }),
      ),
    ).toBe(true);
  });

  // Only `multiple` leaves a cupo to choose; the default resolution is `auto`,
  // which arrives preselected and never waits for an answer.
  test("blocks the save while a cupo is still to be chosen", () => {
    expect(
      canSubmitModalityCorrection(
        buildInput({
          resolution: buildResolution({
            scheduleCapacity: {
              options: [
                { id: "cupo_1", isFull: false, label: "1 de mayo" },
                { id: "cupo_2", isFull: false, label: "2 de mayo" },
              ],
              status: "multiple",
            },
          }),
          watchedScheduleCapacityId: "",
        }),
      ),
    ).toBe(false);
  });

  test("blocks the save when every compatible cupo is full", () => {
    expect(
      canSubmitModalityCorrection(
        buildInput({
          resolution: buildResolution({
            scheduleCapacity: {
              options: [{ id: "cupo_1", isFull: true, label: "1 de mayo" }],
              status: "multiple",
            },
          }),
          watchedScheduleCapacityId: "",
        }),
      ),
    ).toBe(false);
  });

  function buildInput(
    overrides: Partial<Parameters<typeof canSubmitModalityCorrection>[0]> = {},
  ) {
    return {
      canCorrectModality: true,
      isResolving: false,
      isSubmitting: false,
      persistedModalityId: "jazz",
      resolution: buildResolution(),
      resolvedModalityId: "urbano",
      selectedModalityId: "urbano",
      watchedExperienceLevelId: "",
      watchedScheduleCapacityId: "cupo_1",
      watchedSubmodalityId: "",
      ...overrides,
    };
  }
});

function buildResolution(
  overrides: Partial<ChoreographyModalityResolution> = {},
): ChoreographyModalityResolution {
  return {
    category: { id: "juvenil", name: "Juvenil" },
    experienceLevel: { options: [], required: false },
    modalityId: "urbano",
    scheduleCapacity: {
      options: [{ id: "cupo_1", isFull: false, label: "1 de mayo" }],
      status: "auto",
    },
    submodality: { options: [], required: false },
    ...overrides,
  };
}

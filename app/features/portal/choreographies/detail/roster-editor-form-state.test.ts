import { describe, expect, test } from "vitest";

import {
  canSubmitChoreographyEdit,
  getReadonlyChoreographyLabels,
  getResolvedRosterFieldState,
  shouldResolveRosterSelection,
} from "@/features/portal/choreographies/detail/roster-editor-form-state";
import type { DancerResolutionState } from "@/features/portal/choreographies/detail/roster-editor.shared";

describe("roster editor form state", () => {
  test("allows professor-only changes without requiring roster resolution", () => {
    expect(
      canSubmitChoreographyEdit({
        canEditDancers: true,
        canEditMusic: true,
        canEditProfessors: true,
        dancerSelectionKey: "dancer_1",
        derivedResolution: baseDerivedResolution(),
        hasProfessorsChanged: true,
        hasMusicChanged: false,
        hasRosterChanged: false,
        isResolving: false,
        isSubmitting: false,
        musicHasValidationError: false,
        resolution: null,
        resolvedSelectionKey: "",
        scheduleResolution: null,
        watchedDancerIds: ["dancer_1"],
        watchedExperienceLevelId: "",
        watchedScheduleCapacityId: "",
      }),
    ).toBe(true);
  });

  test("prevents duplicate dancer-resolution submissions for the same roster selection", () => {
    expect(
      shouldResolveRosterSelection({
        canEditDancers: true,
        dancerSelectionKey: "dancer_1|dancer_2",
        hasRosterChanged: true,
        resolvedSelectionKey: "dancer_1",
        submittedSelectionKey: "dancer_1|dancer_2",
        watchedDancerIds: ["dancer_1", "dancer_2"],
      }),
    ).toBe(false);
  });

  test("maps auto-assigned schedule and category changes into form resets", () => {
    expect(
      getResolvedRosterFieldState({
        derivedResolution: baseDerivedResolution(),
        result: {
          ok: true,
          resolution: {
            groupType: "duo",
            categoryId: "category_2",
            categoryName: "Adultos",
            categoryCalculationMode: "group_average",
            categoryAgeBasis: 14,
            experienceLevel: {
              required: false,
              options: [],
            },
            schedule: {
              status: "auto",
              canSave: true,
              selectedScheduleCapacityId: "schedule_auto",
              options: [scheduleOption("schedule_auto")],
            },
          },
        },
        watchedScheduleCapacityId: "",
      }),
    ).toEqual({
      nextDerivedResolution: {
        groupType: "duo",
        categoryId: "category_2",
        categoryName: "Adultos",
        categoryCalculationMode: "group_average",
        categoryAgeBasis: 14,
        experienceLevelRequired: false,
        experienceLevelOptions: [],
      },
      nextScheduleCapacityId: "schedule_auto",
      scheduleError: null,
      shouldResetExperienceLevel: true,
      shouldClearScheduleError: true,
    });
  });

  test("clears an incompatible selected cupo when multiple options remain", () => {
    expect(
      getResolvedRosterFieldState({
        derivedResolution: baseDerivedResolution(),
        result: {
          ok: true,
          resolution: {
            groupType: "duo",
            categoryId: "category_1",
            categoryName: "Juvenil",
            experienceLevel: {
              required: true,
              options: [{ id: "level_1", name: "Inicial" }],
            },
            schedule: {
              status: "multiple",
              canSave: true,
              selectedScheduleCapacityId: null,
              options: [
                scheduleOption("schedule_1"),
                scheduleOption("schedule_2"),
              ],
            },
          },
        },
        watchedScheduleCapacityId: "schedule_missing",
      }),
    ).toMatchObject({
      nextScheduleCapacityId: "",
      scheduleError: null,
      shouldResetExperienceLevel: false,
      shouldClearScheduleError: false,
    });
  });

  test("shows the auto-selected schedule label while the roster change is pending confirmation", () => {
    expect(
      getReadonlyChoreographyLabels({
        choreography: {
          ...baseChoreography(),
          scheduleLabel: "Persisted schedule",
        },
        hasResolvedRosterChange: true,
        scheduleResolution: {
          status: "auto",
          canSave: true,
          selectedScheduleCapacityId: "schedule_auto",
          options: [scheduleOption("schedule_auto")],
        },
      }),
    ).toEqual({
      readonlyExperienceLevelName: "",
      readonlyScheduleLabel: "1 de mayo de 2026 - 10:00 hs.",
    });
  });
});

function baseDerivedResolution(): DancerResolutionState {
  return {
    groupType: "solo",
    categoryId: "category_1",
    categoryName: "Juvenil",
    categoryCalculationMode: null,
    categoryAgeBasis: null,
    experienceLevelRequired: true,
    experienceLevelOptions: [{ id: "level_1", name: "Inicial" }],
  };
}

function baseChoreography() {
  return {
    id: "choreo_1",
    name: "Mi pieza",
    modalityName: "Jazz",
    submodalityName: "Lyrical",
    hasPresentation: false,
    groupType: "solo" as const,
    categoryId: "category_1",
    categoryName: "Juvenil",
    dancerEditingEligibility: {
      canEdit: true as const,
      reasonCode: null,
      reasonText: null,
    },
    experienceLevelId: "level_1",
    experienceLevelName: "Inicial",
    operationalStatus: {
      code: "complete" as const,
      pendingItems: [],
    },
    musicStorageKey: null,
    musicDownloadUrl: null,
    scheduleCapacityId: "schedule_1",
    scheduleLabel: "Persisted schedule",
    dancers: [],
    professors: [],
  };
}

function scheduleOption(id: string) {
  return {
    id,
    scheduleId: `block_${id}`,
    scheduleCapacityId: id,
    capacity: 5,
    groupType: "duo" as const,
    usesGlobalCapacity: false,
    schedule: {
      id: `block_${id}`,
      name: `Bloque ${id}`,
      scheduledDate: "2026-05-01",
      startTime: "10:00",
    },
  };
}

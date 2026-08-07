import { describe, expect, test } from "vitest";

import type {
  ChoreographyDancerScheduleOption,
  ChoreographyDancerScheduleResolution,
  ResolveChoreographyDancersResult,
} from "@/lib/choreographies/choreography-roster.shared";

import {
  canSubmitChoreographyEdit,
  getResolvedRosterFieldState,
  getSelectionKey,
  hasNoCompatibleCategory,
  shouldRenderRosterScheduleSelect,
  shouldResolveRosterSelection,
  type RosterResolutionState,
} from "./roster-form-state";

describe("getSelectionKey", () => {
  test("ignores order so reordering the same roster is not a change", () => {
    expect(getSelectionKey(["b", "a"])).toBe(getSelectionKey(["a", "b"]));
  });
});

describe("shouldResolveRosterSelection", () => {
  const base = {
    canEditRoster: true,
    hasRosterChanged: true,
    resolvedSelectionKey: "a",
    selectionKey: "a|b",
    submittedSelectionKey: null,
    watchedDancerIds: ["a", "b"],
  };

  test("resolves a roster selection the server has not seen yet", () => {
    expect(shouldResolveRosterSelection(base)).toBe(true);
  });

  test("does not resolve the same selection twice while it is in flight", () => {
    expect(
      shouldResolveRosterSelection({ ...base, submittedSelectionKey: "a|b" }),
    ).toBe(false);
  });

  test("does not resolve an already resolved selection", () => {
    expect(
      shouldResolveRosterSelection({ ...base, resolvedSelectionKey: "a|b" }),
    ).toBe(false);
  });

  test("does not resolve an empty roster", () => {
    expect(
      shouldResolveRosterSelection({
        ...base,
        selectionKey: "",
        watchedDancerIds: [],
      }),
    ).toBe(false);
  });

  test("does not resolve when the roster is locked", () => {
    expect(
      shouldResolveRosterSelection({ ...base, canEditRoster: false }),
    ).toBe(false);
  });
});

describe("getResolvedRosterFieldState", () => {
  test("preselects the schedule the server auto-resolved", () => {
    const state = getResolvedRosterFieldState({
      currentCategoryId: "category_1",
      result: buildResolution({
        schedule: {
          status: "auto",
          canSave: true,
          options: [buildScheduleOption("capacity_2")],
          selectedScheduleCapacityId: "capacity_2",
        },
      }),
      watchedScheduleCapacityId: "",
    });

    expect(state.nextScheduleCapacityId).toBe("capacity_2");
  });

  test("clears the schedule when the admin must pick between several", () => {
    const state = getResolvedRosterFieldState({
      currentCategoryId: "category_1",
      result: buildResolution({
        schedule: {
          status: "multiple",
          canSave: true,
          options: [buildScheduleOption("capacity_3")],
          selectedScheduleCapacityId: null,
        },
      }),
      watchedScheduleCapacityId: "capacity_9",
    });

    expect(state.nextScheduleCapacityId).toBe("");
  });

  test("keeps a still-valid choice when the admin must pick between several", () => {
    const state = getResolvedRosterFieldState({
      currentCategoryId: "category_1",
      result: buildResolution({
        schedule: {
          status: "multiple",
          canSave: true,
          options: [buildScheduleOption("capacity_3")],
          selectedScheduleCapacityId: null,
        },
      }),
      watchedScheduleCapacityId: "capacity_3",
    });

    expect(state.nextScheduleCapacityId).toBe("capacity_3");
  });

  test("resets the experience level when the category changed under it", () => {
    const state = getResolvedRosterFieldState({
      currentCategoryId: "category_1",
      result: buildResolution({ categoryId: "category_2" }),
      watchedScheduleCapacityId: "",
    });

    expect(state.shouldResetExperienceLevel).toBe(true);
  });

  test("keeps the experience level when the category held", () => {
    const state = getResolvedRosterFieldState({
      currentCategoryId: "category_1",
      result: buildResolution({ categoryId: "category_1" }),
      watchedScheduleCapacityId: "",
    });

    expect(state.shouldResetExperienceLevel).toBe(false);
  });
});

describe("hasNoCompatibleCategory", () => {
  test("flags a resolved roster the server could not categorize", () => {
    expect(
      hasNoCompatibleCategory({
        derivedResolution: buildDerived({ categoryId: null }),
        hasResolvedRosterChange: true,
      }),
    ).toBe(true);
  });

  test("does not flag the persisted roster before any change resolves", () => {
    expect(
      hasNoCompatibleCategory({
        derivedResolution: buildDerived({ categoryId: null }),
        hasResolvedRosterChange: false,
      }),
    ).toBe(false);
  });
});

describe("canSubmitChoreographyEdit", () => {
  const base = {
    canEditRoster: true,
    derivedResolution: buildDerived(),
    hasNameChanged: false,
    hasProfessorsChanged: false,
    hasRosterChanged: true,
    isResolving: false,
    isSubmitting: false,
    resolution: buildResolution() as ResolveChoreographyDancersResult,
    resolvedSelectionKey: "a|b",
    scheduleResolution: buildKeepCurrentSchedule(),
    selectionKey: "a|b",
    watchedDancerIds: ["a", "b"],
    watchedExperienceLevelId: "amateur",
    watchedScheduleCapacityId: "capacity_1",
  };

  test("submits a fully resolved roster change", () => {
    expect(canSubmitChoreographyEdit(base)).toBe(true);
  });

  test("does not submit when nothing changed", () => {
    expect(
      canSubmitChoreographyEdit({
        ...base,
        hasRosterChanged: false,
      }),
    ).toBe(false);
  });

  test("submits a name-only change without resolving the roster", () => {
    expect(
      canSubmitChoreographyEdit({
        ...base,
        hasNameChanged: true,
        hasRosterChanged: false,
        resolution: null,
        resolvedSelectionKey: "",
      }),
    ).toBe(true);
  });

  test("does not submit while the resolution is in flight", () => {
    expect(canSubmitChoreographyEdit({ ...base, isResolving: true })).toBe(
      false,
    );
  });

  test("does not submit a roster the server has not resolved yet", () => {
    expect(
      canSubmitChoreographyEdit({
        ...base,
        resolvedSelectionKey: "a",
      }),
    ).toBe(false);
  });

  test("does not submit a roster without a compatible category", () => {
    expect(
      canSubmitChoreographyEdit({
        ...base,
        derivedResolution: buildDerived({ categoryId: null }),
      }),
    ).toBe(false);
  });

  test("does not submit when the required experience level is missing", () => {
    expect(
      canSubmitChoreographyEdit({
        ...base,
        watchedExperienceLevelId: "",
      }),
    ).toBe(false);
  });

  test("does not submit when a schedule must be picked and was not", () => {
    expect(
      canSubmitChoreographyEdit({
        ...base,
        scheduleResolution: {
          status: "multiple",
          canSave: true,
          options: [buildScheduleOption("capacity_3")],
          selectedScheduleCapacityId: null,
        },
        watchedScheduleCapacityId: "",
      }),
    ).toBe(false);
  });

  test("does not submit when no schedule fits the new roster", () => {
    expect(
      canSubmitChoreographyEdit({
        ...base,
        scheduleResolution: {
          status: "none",
          canSave: false,
          error: "No hay cronograma disponible.",
          options: [],
          selectedScheduleCapacityId: null,
        },
      }),
    ).toBe(false);
  });

  test("does not submit an empty roster", () => {
    expect(
      canSubmitChoreographyEdit({
        ...base,
        selectionKey: "",
        watchedDancerIds: [],
      }),
    ).toBe(false);
  });

  test("does not submit roster changes on a locked roster", () => {
    expect(
      canSubmitChoreographyEdit({
        ...base,
        canEditRoster: false,
      }),
    ).toBe(false);
  });
});

function buildDerived(
  overrides: Partial<RosterResolutionState> = {},
): RosterResolutionState {
  return {
    categoryId: "category_1",
    categoryName: "Juvenil",
    experienceLevelOptions: [{ id: "amateur", name: "Amateur" }],
    experienceLevelRequired: true,
    groupType: "duo",
    ...overrides,
  };
}

function buildKeepCurrentSchedule(): ChoreographyDancerScheduleResolution {
  return {
    status: "keep-current",
    canSave: true,
    options: [buildScheduleOption("capacity_1")],
    selectedScheduleCapacityId: "capacity_1",
  };
}

describe("shouldRenderRosterScheduleSelect", () => {
  const multipleResolution: ChoreographyDancerScheduleResolution = {
    status: "multiple",
    canSave: true,
    options: [
      buildScheduleOption("capacity_1"),
      buildScheduleOption("capacity_2"),
    ],
    selectedScheduleCapacityId: null,
  };

  test("renders the roster select while a roster change is pending", () => {
    expect(
      shouldRenderRosterScheduleSelect({
        hasResolvedRosterChange: true,
        scheduleResolution: multipleResolution,
      }),
    ).toBe(true);
  });

  test("leaves the slot to the standalone reassignment without a pending roster change", () => {
    expect(
      shouldRenderRosterScheduleSelect({
        hasResolvedRosterChange: false,
        scheduleResolution: multipleResolution,
      }),
    ).toBe(false);
    expect(
      shouldRenderRosterScheduleSelect({
        hasResolvedRosterChange: true,
        scheduleResolution: null,
      }),
    ).toBe(false);
  });
});

function buildScheduleOption(id: string): ChoreographyDancerScheduleOption {
  return {
    id,
    scheduleId: "schedule_1",
    scheduleCapacityId: id,
    groupType: "duo",
    capacity: 10,
    usesGlobalCapacity: false,
    schedule: {
      id: "schedule_1",
      name: "Jornada 1",
      scheduledDate: "2026-05-01",
      startTime: "14:00:00",
    },
  };
}

function buildResolution(
  overrides: {
    categoryId?: string | null;
    schedule?: ChoreographyDancerScheduleResolution;
  } = {},
): Extract<ResolveChoreographyDancersResult, { ok: true }> {
  return {
    ok: true,
    resolution: {
      groupType: "duo",
      categoryId:
        overrides.categoryId === undefined
          ? "category_1"
          : overrides.categoryId,
      categoryName: overrides.categoryId === null ? null : "Juvenil",
      experienceLevel: {
        required: true,
        options: [{ id: "amateur", name: "Amateur" }],
      },
      schedule: overrides.schedule ?? buildKeepCurrentSchedule(),
    },
  };
}

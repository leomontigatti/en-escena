import { describe, expect, test } from "vitest";

import type {
  ChoreographyDancerScheduleChoice,
  ChoreographyDancerScheduleResolution,
  ResolveChoreographyDancersResult,
} from "@/lib/choreographies/choreography-roster.shared";

import {
  canSubmitChoreographyEdit,
  getExperienceLevelSlotState,
  getPersistedRosterResolutionState,
  getResolvedRosterFieldState,
  getSelectionKey,
  getWithdrawnDancers,
  hasNoCompatibleCategory,
  getRosterScheduleSelectOptions,
  shouldResolveRosterSelection,
  type RosterResolutionState,
} from "./roster-form-state";
import type { ChoreographyDetail } from "./server";

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
    showRosterExperienceLevelSelect: true,
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

  // Reproduces the category round trip: an intermediate resolution clears the
  // level from the roster form and the next one returns to the persisted
  // category, where the server's retention keeps the saved level and the slot
  // moves to the standalone reassignment. Requiring it anyway left "Guardar"
  // disabled with no field to fill it in with.
  test("submits with an empty level when the slot went to the standalone field", () => {
    expect(
      canSubmitChoreographyEdit({
        ...base,
        showRosterExperienceLevelSelect: false,
        watchedExperienceLevelId: "",
      }),
    ).toBe(true);
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

describe("getRosterScheduleSelectOptions", () => {
  const multipleResolution: ChoreographyDancerScheduleResolution = {
    status: "multiple",
    canSave: true,
    options: [
      buildScheduleOption("capacity_1"),
      buildScheduleOption("capacity_2"),
    ],
    selectedScheduleCapacityId: null,
  };

  test("hands over the labelled options while a roster change is pending", () => {
    expect(
      getRosterScheduleSelectOptions({
        hasResolvedRosterChange: true,
        scheduleResolution: multipleResolution,
      }),
    ).toEqual(multipleResolution.options);
  });

  test("leaves the slot to the standalone reassignment without a pending roster change", () => {
    expect(
      getRosterScheduleSelectOptions({
        hasResolvedRosterChange: false,
        scheduleResolution: multipleResolution,
      }),
    ).toBeNull();
    expect(
      getRosterScheduleSelectOptions({
        hasResolvedRosterChange: true,
        scheduleResolution: null,
      }),
    ).toBeNull();
  });
});

describe("getPersistedRosterResolutionState", () => {
  // The previous derivation read `experienceLevelId !== null`, so a choreography
  // missing the level claimed not to need it.
  test("reads requiredness off the category, not off the stored level", () => {
    const state = getPersistedRosterResolutionState(
      buildChoreography({
        experienceLevelId: null,
        experienceLevelName: null,
        requiresExperienceLevel: true,
      }),
    );

    expect(state.experienceLevelRequired).toBe(true);
  });

  test("does not require a level when the category declares none", () => {
    const state = getPersistedRosterResolutionState(
      buildChoreography({
        experienceLevelOptions: [],
        requiresExperienceLevel: false,
      }),
    );

    expect(state.experienceLevelRequired).toBe(false);
  });

  test("offers every level the category admits, not only the assigned one", () => {
    const state = getPersistedRosterResolutionState(buildChoreography());

    expect(state.experienceLevelOptions).toEqual([
      { id: "amateur", name: "Amateur" },
      { id: "profesional", name: "Profesional" },
    ]);
  });
});

describe("getExperienceLevelSlotState", () => {
  test("leaves the slot to the standalone reassignment without a pending roster change", () => {
    expect(
      getExperienceLevelSlotState({
        choreography: buildChoreography(),
        derivedResolution: buildDerived(),
        hasResolvedRosterChange: false,
      }),
    ).toEqual({
      experienceLevelId: "amateur",
      requiresExperienceLevel: true,
      showRosterSelect: false,
    });
  });

  // The server's retention keeps the saved level when the category holds, so the
  // roster's select has nothing to offer there.
  test("keeps the standalone field when the pending change holds the category", () => {
    expect(
      getExperienceLevelSlotState({
        choreography: buildChoreography(),
        derivedResolution: buildDerived({
          categoryId: "category_1",
          experienceLevelOptions: [
            { id: "amateur", name: "Amateur" },
            { id: "profesional", name: "Profesional" },
          ],
        }),
        hasResolvedRosterChange: true,
      }),
    ).toEqual({
      experienceLevelId: "amateur",
      requiresExperienceLevel: true,
      showRosterSelect: false,
    });
  });

  // The retention requires a valid saved value. Without one, saving the roster
  // needs a new level, and `canSubmitRosterChange` will require it: the field has
  // to be in the roster form or the admin cannot save.
  test("hands the slot to the roster form when the category holds but the stored level is missing", () => {
    expect(
      getExperienceLevelSlotState({
        choreography: buildChoreography({
          experienceLevelId: null,
          experienceLevelName: null,
        }),
        derivedResolution: buildDerived({ categoryId: "category_1" }),
        hasResolvedRosterChange: true,
      }),
    ).toEqual({
      experienceLevelId: "",
      requiresExperienceLevel: true,
      showRosterSelect: true,
    });
  });

  test("hands the slot to the roster form when the category holds but no longer admits the stored level", () => {
    expect(
      getExperienceLevelSlotState({
        choreography: buildChoreography(),
        derivedResolution: buildDerived({
          categoryId: "category_1",
          experienceLevelOptions: [{ id: "profesional", name: "Profesional" }],
        }),
        hasResolvedRosterChange: true,
      }),
    ).toEqual({
      experienceLevelId: "",
      requiresExperienceLevel: true,
      showRosterSelect: true,
    });
  });

  test("hands the slot to the roster form when the pending change moves to a category with levels", () => {
    expect(
      getExperienceLevelSlotState({
        choreography: buildChoreography(),
        derivedResolution: buildDerived({ categoryId: "category_2" }),
        hasResolvedRosterChange: true,
      }),
    ).toEqual({
      experienceLevelId: "",
      requiresExperienceLevel: true,
      showRosterSelect: true,
    });
  });

  // `update-roster` nulls the level out when the new category does not ask for
  // it, so the field shows the resolved state and not the one saving will erase.
  test("shows the resolved emptiness when the pending change moves to a category without levels", () => {
    expect(
      getExperienceLevelSlotState({
        choreography: buildChoreography(),
        derivedResolution: buildDerived({
          categoryId: "category_2",
          experienceLevelRequired: false,
        }),
        hasResolvedRosterChange: true,
      }),
    ).toEqual({
      experienceLevelId: "",
      requiresExperienceLevel: false,
      showRosterSelect: false,
    });
  });
});

function buildChoreography(
  overrides: Partial<ChoreographyDetail> = {},
): ChoreographyDetail {
  return {
    categoryId: "category_1",
    experienceLevelId: "amateur",
    experienceLevelName: "Amateur",
    experienceLevelOptions: [
      { id: "amateur", name: "Amateur" },
      { id: "profesional", name: "Profesional" },
    ],
    groupType: "duo",
    requiresExperienceLevel: true,
    ...overrides,
  } as ChoreographyDetail;
}

// Returns the labelled variant, which is what the "multiple" resolution demands
// and still serves wherever `ChoreographyDancerScheduleOption` is enough.
function buildScheduleOption(id: string): ChoreographyDancerScheduleChoice {
  return {
    id,
    scheduleId: "schedule_1",
    scheduleCapacityId: id,
    groupType: "duo",
    capacity: 10,
    usesGlobalCapacity: false,
    isFull: false,
    label: "1 de mayo de 2026 - 14:00 hs. · 0/10 ocupados",
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

describe("getWithdrawnDancers", () => {
  const dancers = [
    {
      active: true,
      ageAtEventStart: 14,
      firstName: "Ana",
      hasEvidence: true,
      id: "dancer_1",
      lastName: "Uno",
    },
    {
      active: true,
      ageAtEventStart: 15,
      firstName: "Bea",
      hasEvidence: false,
      id: "dancer_2",
      lastName: "Dos",
    },
  ];

  test("names the removed dancers whose inscription has evidence", () => {
    expect(getWithdrawnDancers({ dancers, watchedDancerIds: [] })).toEqual([
      { id: "dancer_1", name: "Ana Uno" },
    ]);
  });

  test("says nothing when the removed inscription has no evidence to preserve", () => {
    expect(
      getWithdrawnDancers({ dancers, watchedDancerIds: ["dancer_1"] }),
    ).toEqual([]);
  });

  test("says nothing when nobody leaves the roster", () => {
    expect(
      getWithdrawnDancers({
        dancers,
        watchedDancerIds: ["dancer_1", "dancer_2"],
      }),
    ).toEqual([]);
  });

  test("keeps homonyms apart, since the name alone does not identify the row", () => {
    const homonyms = [
      { ...dancers[0], id: "dancer_1" },
      { ...dancers[0], hasEvidence: true, id: "dancer_3" },
    ];

    expect(
      getWithdrawnDancers({ dancers: homonyms, watchedDancerIds: [] }),
    ).toEqual([
      { id: "dancer_1", name: "Ana Uno" },
      { id: "dancer_3", name: "Ana Uno" },
    ]);
  });
});

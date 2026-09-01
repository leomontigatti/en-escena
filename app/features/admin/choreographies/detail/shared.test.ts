import { describe, expect, test } from "vitest";

import {
  canCorrectChoreographyModality,
  canReassignExperienceLevel,
  canReassignScheduleCapacity,
  renameChoreographyIntent,
  resolveChoreographyModalityIntent,
  resolveChoreographyRosterIntent,
  shouldRevalidateChoreographyDetail,
  toChoreographyDetailViewActionData,
  updateChoreographyModalityIntent,
  updateChoreographyRosterIntent,
} from "./shared";

describe("shouldRevalidateChoreographyDetail", () => {
  test("does not revalidate after resolving a tentative roster", () => {
    expect(
      shouldRevalidateChoreographyDetail({
        defaultShouldRevalidate: true,
        formData: buildFormData(resolveChoreographyRosterIntent),
      }),
    ).toBe(false);
  });

  test("revalidates after the roster is actually saved", () => {
    expect(
      shouldRevalidateChoreographyDetail({
        defaultShouldRevalidate: true,
        formData: buildFormData(updateChoreographyRosterIntent),
      }),
    ).toBe(true);
  });

  test("does not revalidate after previewing a candidate modality", () => {
    expect(
      shouldRevalidateChoreographyDetail({
        defaultShouldRevalidate: true,
        formData: buildFormData(resolveChoreographyModalityIntent),
      }),
    ).toBe(false);
  });

  test("revalidates after the modality correction is saved", () => {
    expect(
      shouldRevalidateChoreographyDetail({
        defaultShouldRevalidate: true,
        formData: buildFormData(updateChoreographyModalityIntent),
      }),
    ).toBe(true);
  });

  test("revalidates after a rename", () => {
    expect(
      shouldRevalidateChoreographyDetail({
        defaultShouldRevalidate: true,
        formData: buildFormData(renameChoreographyIntent),
      }),
    ).toBe(true);
  });

  test("defers to the router when there is no form data", () => {
    expect(
      shouldRevalidateChoreographyDetail({
        defaultShouldRevalidate: false,
      }),
    ).toBe(false);
  });
});

describe("toChoreographyDetailViewActionData", () => {
  test("forwards the rejection of a cupo de cronograma to the view", () => {
    const rejection = {
      message:
        "El cupo de cronograma seleccionado ya no tiene cupo disponible.",
      status: "error",
    } as const;

    expect(toChoreographyDetailViewActionData(rejection)).toBe(rejection);
  });

  test("forwards a saved confirmation", () => {
    const success = {
      message: "Coreografía guardada.",
      status: "success",
    } as const;

    expect(toChoreographyDetailViewActionData(success)).toBe(success);
  });

  test("drops a bespoke status the view never reads", () => {
    expect(
      toChoreographyDetailViewActionData({
        message: "Revisá el roster.",
        section: "dancers",
        status: "roster-error",
      }),
    ).toBeUndefined();
  });

  test("drops results without a status and redirects", () => {
    expect(
      toChoreographyDetailViewActionData({
        intent: resolveChoreographyRosterIntent,
      }),
    ).toBeUndefined();
    expect(toChoreographyDetailViewActionData(new Response())).toBeUndefined();
    expect(toChoreographyDetailViewActionData()).toBeUndefined();
  });
});

describe("canReassignScheduleCapacity", () => {
  const frozenDeposit = {
    code: "frozen-price",
    label: "Al menos una inscripción tiene dinero asignado.",
  } as const;

  test("opens the cupo de cronograma for an admin with alternatives and no blockers", () => {
    expect(canReassignScheduleCapacity(buildInput())).toBe(true);
  });

  test.each([
    ["the user is not an admin", { canEdit: false }],
    ["the choreography has a presentation", { hasPresentation: true }],
    ["an inscription carries a frozen deposit", { blockers: [frozenDeposit] }],
    [
      "there are fewer than two compatible cupos",
      { hasMultipleCompatibleOptions: false },
    ],
  ])("keeps it read-only when %s", (_cause, overrides) => {
    expect(canReassignScheduleCapacity(buildInput(overrides))).toBe(false);
  });

  function buildInput(
    overrides: Partial<Parameters<typeof canReassignScheduleCapacity>[0]> = {},
  ) {
    return {
      blockers: [],
      canEdit: true,
      hasMultipleCompatibleOptions: true,
      hasPresentation: false,
      ...overrides,
    };
  }
});

describe("canReassignExperienceLevel", () => {
  test("opens the nivel de experiencia for an admin whose category declares levels", () => {
    expect(canReassignExperienceLevel(buildInput())).toBe(true);
  });

  test.each([
    ["the user is not an admin", { canEdit: false }],
    ["the choreography has a presentation", { hasPresentation: true }],
    [
      "the resolved category declares no levels",
      { requiresExperienceLevel: false },
    ],
  ])("keeps it read-only when %s", (_cause, overrides) => {
    expect(canReassignExperienceLevel(buildInput(overrides))).toBe(false);
  });

  // Unlike the capacity, a single option does not close the field: it is the only
  // way to resolve a missing level that leaves the choreography incomplete.
  test("stays open with a single available level", () => {
    expect(
      canReassignExperienceLevel(buildInput({ requiresExperienceLevel: true })),
    ).toBe(true);
  });

  function buildInput(
    overrides: Partial<Parameters<typeof canReassignExperienceLevel>[0]> = {},
  ) {
    return {
      canEdit: true,
      hasPresentation: false,
      requiresExperienceLevel: true,
      ...overrides,
    };
  }
});

describe("canCorrectChoreographyModality", () => {
  test("opens the modalidad for an admin on a choreography without presentation", () => {
    expect(canCorrectChoreographyModality(buildInput())).toBe(true);
  });

  test.each([
    ["the user is not an admin", { canEdit: false }],
    ["the choreography has a presentation", { hasPresentation: true }],
  ])("keeps it read-only when %s", (_cause, overrides) => {
    expect(canCorrectChoreographyModality(buildInput(overrides))).toBe(false);
  });

  function buildInput(
    overrides: Partial<
      Parameters<typeof canCorrectChoreographyModality>[0]
    > = {},
  ) {
    return {
      canEdit: true,
      hasPresentation: false,
      ...overrides,
    };
  }
});

function buildFormData(intent: string) {
  const formData = new FormData();
  formData.set("intent", intent);

  return formData;
}

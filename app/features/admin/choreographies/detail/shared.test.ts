import { describe, expect, test } from "vitest";

import {
  canReassignScheduleCapacity,
  renameChoreographyIntent,
  resolveChoreographyRosterIntent,
  shouldRevalidateChoreographyDetail,
  toChoreographyDetailViewActionData,
  toScheduleCapacitySelectOptions,
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
    code: "frozen-deposit",
    label: "Al menos una inscripción tiene seña registrada.",
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

describe("toScheduleCapacitySelectOptions", () => {
  test("disables the options whose cupo is full and no others", () => {
    expect(
      toScheduleCapacitySelectOptions([
        {
          id: "schedule_capacity_1",
          isFull: false,
          label: "1 de mayo de 2026 - 14:00 hs. · 3/5 ocupados",
        },
        {
          id: "schedule_capacity_2",
          isFull: true,
          label: "2 de mayo de 2026 - 10:00 hs. · 5/5 ocupados · sin cupo",
        },
      ]),
    ).toEqual([
      {
        disabled: false,
        label: "1 de mayo de 2026 - 14:00 hs. · 3/5 ocupados",
        value: "schedule_capacity_1",
      },
      {
        disabled: true,
        label: "2 de mayo de 2026 - 10:00 hs. · 5/5 ocupados · sin cupo",
        value: "schedule_capacity_2",
      },
    ]);
  });
});

function buildFormData(intent: string) {
  const formData = new FormData();
  formData.set("intent", intent);

  return formData;
}

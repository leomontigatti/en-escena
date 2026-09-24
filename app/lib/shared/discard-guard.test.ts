import { describe, expect, test } from "vitest";

import { hasUnsavedChanges, reduceDiscardGuard } from "./discard-guard";

describe("unsaved changes", () => {
  test("counts a dirty field", () => {
    expect(hasUnsavedChanges({ isAudioDirty: false, isFormDirty: true })).toBe(
      true,
    );
  });

  test("counts audio that differs from what was saved, with untouched fields", () => {
    expect(hasUnsavedChanges({ isAudioDirty: true, isFormDirty: false })).toBe(
      true,
    );
  });

  test("finds nothing to lose when neither changed", () => {
    expect(hasUnsavedChanges({ isAudioDirty: false, isFormDirty: false })).toBe(
      false,
    );
  });
});

describe("the discard guard", () => {
  test("closes a clean form without asking", () => {
    expect(
      reduceDiscardGuard({
        hasUnsavedChanges: false,
        type: "close-requested",
      }),
    ).toEqual({ closes: true, state: { isAskingToDiscard: false } });
  });

  test("asks before closing a dirty form", () => {
    expect(
      reduceDiscardGuard({ hasUnsavedChanges: true, type: "close-requested" }),
    ).toEqual({ closes: false, state: { isAskingToDiscard: true } });
  });

  test("closes once the changes are discarded", () => {
    expect(reduceDiscardGuard({ type: "discard-confirmed" })).toEqual({
      closes: true,
      state: { isAskingToDiscard: false },
    });
  });

  test("returns to the form when the question is dismissed", () => {
    expect(reduceDiscardGuard({ type: "discard-dismissed" })).toEqual({
      closes: false,
      state: { isAskingToDiscard: false },
    });
  });
});

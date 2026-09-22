import { describe, expect, test } from "vitest";

import { buildPortalProfessorDetailViewModel } from "./shared";

function buildViewModel(
  overrides: {
    active?: boolean;
    isParticipatingInActiveEvent?: boolean;
  } = {},
) {
  return buildPortalProfessorDetailViewModel({
    active: overrides.active ?? true,
    isParticipatingInActiveEvent:
      overrides.isParticipatingInActiveEvent ?? false,
  });
}

describe("buildPortalProfessorDetailViewModel", () => {
  test("disables archiving and explains it for a participant of the active event", () => {
    const viewModel = buildViewModel({ isParticipatingInActiveEvent: true });

    expect(viewModel.statusAction.intent).toBe("archive-professor");
    expect(viewModel.statusAction.disabled).toBe(true);
    expect(viewModel.participatingAlert).toBe(
      "Este profesor no puede archivarse porque está participando del evento activo.",
    );
  });

  test("leaves archiving alone when the professor participates in nothing live", () => {
    const viewModel = buildViewModel();

    expect(viewModel.statusAction.disabled).toBe(false);
    expect(viewModel.participatingAlert).toBeNull();
  });

  // Reactivating is never refused, so an archived participant keeps his action.
  test("never disables reactivating an archived participant", () => {
    const viewModel = buildViewModel({
      active: false,
      isParticipatingInActiveEvent: true,
    });

    expect(viewModel.statusAction.intent).toBe("reactivate-professor");
    expect(viewModel.statusAction.disabled).toBe(false);
    expect(viewModel.participatingAlert).toBeNull();
  });
});

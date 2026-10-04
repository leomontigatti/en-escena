import { describe, expect, test } from "vitest";

import { buildProfessorDetailViewState } from "./shared";

describe("buildProfessorDetailViewState", () => {
  test("blocks archiving for a participant of the active event", () => {
    const viewState = buildProfessorDetailViewState({
      active: true,
      isParticipatingInActiveEvent: true,
    });

    expect(viewState.statusAction.intent).toBe("archive-professor");
    expect(viewState.statusAction.isBlocked).toBe(true);
  });

  test("leaves archiving alone when the professor participates in nothing live", () => {
    const viewState = buildProfessorDetailViewState({
      active: true,
      isParticipatingInActiveEvent: false,
    });

    expect(viewState.statusAction.intent).toBe("archive-professor");
    expect(viewState.statusAction.isBlocked).toBe(false);
  });

  // Reactivating is never refused, so the archived participant keeps his
  // action.
  test("never blocks reactivating an archived participant", () => {
    const viewState = buildProfessorDetailViewState({
      active: false,
      isParticipatingInActiveEvent: true,
    });

    expect(viewState.statusAction.intent).toBe("reactivate-professor");
    expect(viewState.statusAction.isBlocked).toBe(false);
  });
});

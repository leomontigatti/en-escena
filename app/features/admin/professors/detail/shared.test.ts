import { describe, expect, test } from "vitest";

import { buildProfessorDetailViewState } from "./shared";

describe("buildProfessorDetailViewState", () => {
  test("disables archiving and explains it for a participant of the active event", () => {
    const viewState = buildProfessorDetailViewState({
      active: true,
      isParticipatingInActiveEvent: true,
    });

    expect(viewState.statusAction.intent).toBe("archive-professor");
    expect(viewState.statusAction.disabled).toBe(true);
    expect(viewState.participatingAlert).toBe(
      "Este profesor no puede archivarse porque está participando del evento activo.",
    );
  });

  test("leaves archiving alone when the professor participates in nothing live", () => {
    const viewState = buildProfessorDetailViewState({
      active: true,
      isParticipatingInActiveEvent: false,
    });

    expect(viewState.statusAction.intent).toBe("archive-professor");
    expect(viewState.statusAction.disabled).toBe(false);
    expect(viewState.participatingAlert).toBeNull();
  });

  // Reactivating is never refused, so the archived participant keeps his
  // action and gets no alert about an unavailability that is not happening.
  test("never disables reactivating an archived participant", () => {
    const viewState = buildProfessorDetailViewState({
      active: false,
      isParticipatingInActiveEvent: true,
    });

    expect(viewState.statusAction.intent).toBe("reactivate-professor");
    expect(viewState.statusAction.disabled).toBe(false);
    expect(viewState.participatingAlert).toBeNull();
  });
});

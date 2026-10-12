import { describe, expect, test } from "vitest";

import { editAffectsParticipation } from "@/lib/admin/dancers/dancers.server.shared";

describe("editAffectsParticipation", () => {
  test("is false when the dancer never participated", () => {
    expect(
      editAffectsParticipation({
        selectedEventId: null,
        isParticipating: false,
        hasParticipatedInAnyEvent: false,
      }),
    ).toBe(false);
  });

  test("is true when the dancer participated in some event", () => {
    expect(
      editAffectsParticipation({
        selectedEventId: null,
        isParticipating: false,
        hasParticipatedInAnyEvent: true,
      }),
    ).toBe(true);
  });

  describe("with a selected event", () => {
    test("is true when participating in the selected event", () => {
      expect(
        editAffectsParticipation({
          selectedEventId: "event-1",
          isParticipating: true,
          hasParticipatedInAnyEvent: false,
        }),
      ).toBe(true);
    });

    test("is true when it participated in any event even if not in the selected one", () => {
      expect(
        editAffectsParticipation({
          selectedEventId: "event-1",
          isParticipating: false,
          hasParticipatedInAnyEvent: true,
        }),
      ).toBe(true);
    });

    test("is false when not participating and never participated", () => {
      expect(
        editAffectsParticipation({
          selectedEventId: "event-1",
          isParticipating: false,
          hasParticipatedInAnyEvent: false,
        }),
      ).toBe(false);
    });
  });

  describe("without a selected event", () => {
    test("ignores isParticipating and only looks at prior participation", () => {
      expect(
        editAffectsParticipation({
          selectedEventId: null,
          isParticipating: true,
          hasParticipatedInAnyEvent: false,
        }),
      ).toBe(false);
    });
  });
});

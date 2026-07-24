import { describe, expect, test } from "vitest";

import { getEditConsequence } from "@/lib/admin/professors/professors.server";

describe("getEditConsequence (professors)", () => {
  test("returns null when it never participated", () => {
    expect(
      getEditConsequence({
        selectedEventId: null,
        isParticipating: false,
        hasParticipatedInAnyEvent: false,
      }),
    ).toBeNull();
  });

  test("returns 'participated' when it participated in some event", () => {
    expect(
      getEditConsequence({
        selectedEventId: null,
        isParticipating: false,
        hasParticipatedInAnyEvent: true,
      }),
    ).toBe("participated");
  });

  describe("with a selected event", () => {
    test("returns 'participated' when participating in that event", () => {
      expect(
        getEditConsequence({
          selectedEventId: "event-1",
          isParticipating: true,
          hasParticipatedInAnyEvent: false,
        }),
      ).toBe("participated");
    });

    test("returns 'participated' when it participated in any event", () => {
      expect(
        getEditConsequence({
          selectedEventId: "event-1",
          isParticipating: false,
          hasParticipatedInAnyEvent: true,
        }),
      ).toBe("participated");
    });

    test("returns null when not participating and never participated", () => {
      expect(
        getEditConsequence({
          selectedEventId: "event-1",
          isParticipating: false,
          hasParticipatedInAnyEvent: false,
        }),
      ).toBeNull();
    });
  });

  describe("without a selected event", () => {
    test("ignores current participation and only looks at any-event history", () => {
      expect(
        getEditConsequence({
          selectedEventId: null,
          isParticipating: true,
          hasParticipatedInAnyEvent: false,
        }),
      ).toBeNull();
    });
  });

  test("never returns 'verified' or 'both' across the truth table", () => {
    const results = [true, false].flatMap((isParticipating) =>
      [true, false].flatMap((hasParticipatedInAnyEvent) =>
        [null, "event-1"].map((selectedEventId) =>
          getEditConsequence({
            selectedEventId,
            isParticipating,
            hasParticipatedInAnyEvent,
          }),
        ),
      ),
    );

    for (const result of results) {
      expect(result === "participated" || result === null).toBe(true);
    }
  });
});

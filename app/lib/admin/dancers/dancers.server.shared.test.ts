import { describe, expect, test } from "vitest";

import { getEditConsequence } from "@/lib/admin/dancers/dancers.server.shared";

describe("getEditConsequence", () => {
  test("returns null when neither verified nor participated", () => {
    expect(
      getEditConsequence({
        selectedEventId: null,
        isParticipating: false,
        hasParticipatedInAnyEvent: false,
        isVerified: false,
      }),
    ).toBeNull();
  });

  test("returns 'verified' when only verified", () => {
    expect(
      getEditConsequence({
        selectedEventId: null,
        isParticipating: false,
        hasParticipatedInAnyEvent: false,
        isVerified: true,
      }),
    ).toBe("verified");
  });

  test("returns 'participated' when it participated in some event but is not verified", () => {
    expect(
      getEditConsequence({
        selectedEventId: null,
        isParticipating: false,
        hasParticipatedInAnyEvent: true,
        isVerified: false,
      }),
    ).toBe("participated");
  });

  test("returns 'both' when verified and participated", () => {
    expect(
      getEditConsequence({
        selectedEventId: null,
        isParticipating: false,
        hasParticipatedInAnyEvent: true,
        isVerified: true,
      }),
    ).toBe("both");
  });

  describe("with a selected event", () => {
    test("returns 'participated' when participating in the selected event", () => {
      expect(
        getEditConsequence({
          selectedEventId: "event-1",
          isParticipating: true,
          hasParticipatedInAnyEvent: false,
          isVerified: false,
        }),
      ).toBe("participated");
    });

    test("returns 'participated' when it participated in any event even if not in the selected one", () => {
      expect(
        getEditConsequence({
          selectedEventId: "event-1",
          isParticipating: false,
          hasParticipatedInAnyEvent: true,
          isVerified: false,
        }),
      ).toBe("participated");
    });

    test("returns null when not participating and never participated", () => {
      expect(
        getEditConsequence({
          selectedEventId: "event-1",
          isParticipating: false,
          hasParticipatedInAnyEvent: false,
          isVerified: false,
        }),
      ).toBeNull();
    });

    test("returns 'both' when verified and participating in the selected event", () => {
      expect(
        getEditConsequence({
          selectedEventId: "event-1",
          isParticipating: true,
          hasParticipatedInAnyEvent: false,
          isVerified: true,
        }),
      ).toBe("both");
    });
  });

  describe("without a selected event", () => {
    test("ignores isParticipating and only looks at prior participation", () => {
      expect(
        getEditConsequence({
          selectedEventId: null,
          isParticipating: true,
          hasParticipatedInAnyEvent: false,
          isVerified: false,
        }),
      ).toBeNull();
    });
  });
});

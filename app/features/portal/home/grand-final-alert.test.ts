import { describe, expect, test } from "vitest";

import { portalGrandFinalAlert } from "./grand-final-alert";

const eventName = "En Escena 2026";

describe("the portal home's `Gran final` alert", () => {
  test("invites an academy that is not eligible while some schedule takes inscriptions", () => {
    expect(
      portalGrandFinalAlert({
        eventName,
        isEligible: false,
        isRegistrationOpen: true,
        voteUrl: null,
      }),
    ).toEqual({ kind: "invitation", eventName });
  });

  test("an eligible academy reads that it meets the requirements instead of the invitation", () => {
    expect(
      portalGrandFinalAlert({
        eventName,
        isEligible: true,
        isRegistrationOpen: true,
        voteUrl: null,
      }),
    ).toEqual({ kind: "eligible" });
  });

  // Inscriptions gate the invitation only: closing them takes away the chance
  // to qualify, not the fact of having qualified.
  test("an eligible academy keeps its alert after inscriptions close", () => {
    expect(
      portalGrandFinalAlert({
        eventName,
        isEligible: true,
        isRegistrationOpen: false,
        voteUrl: null,
      }),
    ).toEqual({ kind: "eligible" });
  });

  test("shows nothing to an academy that is not eligible once no schedule takes inscriptions", () => {
    expect(
      portalGrandFinalAlert({
        eventName,
        isEligible: false,
        isRegistrationOpen: false,
        voteUrl: null,
      }),
    ).toBeNull();
  });

  // The round copies its finalists, so a finalist whose academy stopped
  // being eligible still has a vote to share.
  test.each([
    { isEligible: true, isRegistrationOpen: true },
    { isEligible: false, isRegistrationOpen: true },
    { isEligible: false, isRegistrationOpen: false },
  ])(
    "a finalist of the open round reads the vote URL instead of any other alert (eligible: $isEligible, inscriptions: $isRegistrationOpen)",
    (facts) => {
      expect(
        portalGrandFinalAlert({
          eventName,
          ...facts,
          voteUrl: "https://sistema.enescena.com.ar/votar",
        }),
      ).toEqual({
        kind: "finalist",
        voteUrl: "https://sistema.enescena.com.ar/votar",
      });
    },
  );

  test("shows nothing without an active event", () => {
    expect(portalGrandFinalAlert(null)).toBeNull();
  });
});

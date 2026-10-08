/**
 * What the portal home knows about the `Gran final` of the active event for
 * the signed-in academy: whether it is eligible in some modality (never which
 * one), whether some schedule still takes inscriptions, and the vote URL it
 * can share, set only while a round it is a finalist of is open.
 */
export type PortalGrandFinalFacts = {
  eventName: string;
  isEligible: boolean;
  isRegistrationOpen: boolean;
  voteUrl: string | null;
};

export type PortalGrandFinalAlert =
  | { kind: "eligible" }
  | { kind: "finalist"; voteUrl: string }
  | { kind: "invitation"; eventName: string };

/**
 * The one `Gran final` alert the home shows, by precedence: a finalist of the
 * open round gets the vote URL to share; an eligible academy reads that it
 * meets the requirements; any other one is invited, but only while some
 * schedule takes inscriptions, the only time it can still qualify. `null`
 * without an active event or when none applies.
 */
export function portalGrandFinalAlert(
  grandFinal: PortalGrandFinalFacts | null,
): PortalGrandFinalAlert | null {
  if (!grandFinal) {
    return null;
  }

  if (grandFinal.voteUrl) {
    return { kind: "finalist", voteUrl: grandFinal.voteUrl };
  }

  if (grandFinal.isEligible) {
    return { kind: "eligible" };
  }

  if (grandFinal.isRegistrationOpen) {
    return { kind: "invitation", eventName: grandFinal.eventName };
  }

  return null;
}

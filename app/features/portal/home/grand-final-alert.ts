/**
 * What the portal home knows about the `Gran final` of the active event for
 * the signed-in academy: whether it is eligible in some modality (never which
 * one) and whether some schedule still takes inscriptions.
 */
export type PortalGrandFinalFacts = {
  eventName: string;
  isEligible: boolean;
  isRegistrationOpen: boolean;
};

export type PortalGrandFinalAlert =
  { kind: "eligible" } | { kind: "invitation"; eventName: string };

/**
 * The one `Gran final` alert the home shows, by precedence: an eligible academy
 * reads that it meets the requirements; any other one is invited, but only
 * while some schedule takes inscriptions, the only time it can still qualify.
 * `null` without an active event or when neither applies.
 */
export function portalGrandFinalAlert(
  grandFinal: PortalGrandFinalFacts | null,
): PortalGrandFinalAlert | null {
  if (!grandFinal) {
    return null;
  }

  if (grandFinal.isEligible) {
    return { kind: "eligible" };
  }

  if (grandFinal.isRegistrationOpen) {
    return { kind: "invitation", eventName: grandFinal.eventName };
  }

  return null;
}

import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import { grandFinalEligibility } from "@/lib/grand-final/eligibility.server";
import { getPortalShellEventContext } from "@/lib/portal/event-context.server";

/**
 * What the portal home needs to tell an academy about the `Gran final` of the
 * active event: whether it is eligible in some modality (never which one) and
 * whether some schedule still takes inscriptions. `null` without an active
 * event.
 */
export type PortalHomeLoaderData = {
  grandFinal: {
    eventName: string;
    isEligible: boolean;
    isRegistrationOpen: boolean;
  } | null;
};

export async function loadPortalHome(
  request: Request,
): Promise<PortalHomeLoaderData> {
  const { academy } = await requireAcademyUser(request);
  const { activeEvent, isRegistrationOpen } =
    await getPortalShellEventContext(request);

  if (!activeEvent) {
    return { grandFinal: null };
  }

  const eligiblePairs = await grandFinalEligibility(activeEvent.id);

  return {
    grandFinal: {
      eventName: activeEvent.name,
      isEligible: eligiblePairs.some((pair) => pair.academyId === academy.id),
      isRegistrationOpen,
    },
  };
}

import type { PortalGrandFinalFacts } from "@/features/portal/home/grand-final-alert";
import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import { grandFinalEligibility } from "@/lib/grand-final/eligibility.server";
import { getPortalShellEventContext } from "@/lib/portal/event-context.server";

/** `grandFinal` is `null` without an active event. */
export type PortalHomeLoaderData = {
  grandFinal: PortalGrandFinalFacts | null;
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

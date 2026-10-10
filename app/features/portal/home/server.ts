import type { PortalGrandFinalFacts } from "@/features/portal/home/grand-final-alert";
import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import { grandFinalEligibility } from "@/lib/grand-final/eligibility.server";
import { buildVoteUrl } from "@/lib/grand-final/vote-url";
import { readCurrentVotingRound } from "@/lib/grand-final/voting-round.server";
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

  const [eligiblePairs, round] = await Promise.all([
    grandFinalEligibility(activeEvent.id),
    readCurrentVotingRound(activeEvent.id),
  ]);
  const isOpenRoundFinalist =
    round !== null &&
    round.closedAt === null &&
    round.finalists.some((finalist) => finalist.academyId === academy.id);

  return {
    grandFinal: {
      eventName: activeEvent.name,
      isEligible: eligiblePairs.some((pair) => pair.academyId === academy.id),
      isRegistrationOpen,
      // On `APP_URL`, the address the public knows, as the printed QR codes.
      voteUrl: isOpenRoundFinalist
        ? buildVoteUrl(process.env.APP_URL || new URL(request.url).origin)
        : null,
    },
  };
}

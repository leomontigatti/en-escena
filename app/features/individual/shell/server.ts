import { requireIndividualUser } from "@/lib/auth/internal-access.server";
import {
  getEventStatus,
  type ActiveEventStatusContext,
} from "@/lib/events/event-status";
import { toIndividualFullName } from "@/lib/individuals/personal-data";
import { getPortalActiveEventSummaryContext } from "@/lib/portal/event-context.server";

export async function loadIndividualShell(request: Request) {
  const [{ user, individual }, { activeEvent }] = await Promise.all([
    requireIndividualUser(request),
    getPortalActiveEventSummaryContext(request),
  ]);
  const eventContext: ActiveEventStatusContext = activeEvent
    ? {
        activeEvent: { name: activeEvent.name },
        eventStatus: getEventStatus(activeEvent, new Date()),
      }
    : { activeEvent: null };

  return {
    email: user.email,
    fullName: toIndividualFullName(individual),
    eventContext,
  };
}

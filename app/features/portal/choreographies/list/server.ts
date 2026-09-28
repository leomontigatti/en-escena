import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import { listChoreographiesForAcademyEvent } from "@/lib/portal/choreographies.server";
import { countActiveDancersForAcademy } from "@/lib/portal/dancers.server";
import { getPortalActiveEventReadinessContext } from "@/lib/portal/event-context.server";

export async function loadPortalChoreographiesList(request: Request) {
  const { academy } = await requireAcademyUser(request);
  const eventContext = await getPortalActiveEventReadinessContext(request);
  const selectedEventId = eventContext.selectedEvent?.id ?? null;
  const [choreographies, activeDancerCount] = await Promise.all([
    selectedEventId
      ? listChoreographiesForAcademyEvent(academy.id, selectedEventId)
      : Promise.resolve([]),
    countActiveDancersForAcademy(academy.id),
  ]);

  return {
    choreographies,
    eventContext,
    activeDancerCount,
  };
}

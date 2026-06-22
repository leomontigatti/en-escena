import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import { loadCreateChoreographyDialogData } from "@/lib/portal/choreography-create-dialog.server";
import { getPortalEventContext } from "@/lib/portal/event-context.server";

export async function loader({ request }: { request: Request }) {
  const { academy } = await requireAcademyUser(request);
  const eventContext = await getPortalEventContext(request);
  const selectedEventId = eventContext.selectedEvent?.id ?? null;

  if (!selectedEventId) {
    throw new Response("No hay un evento seleccionado.", { status: 400 });
  }

  return loadCreateChoreographyDialogData({
    academyId: academy.id,
    eventId: selectedEventId,
  });
}

export default function PortalCoreografiasCreateRoute() {
  return null;
}

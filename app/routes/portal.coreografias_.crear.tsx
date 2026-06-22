import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import { loadCreateChoreographyDialogData } from "@/lib/portal/choreography-create-dialog.server";
import { getPortalActiveEventReadinessContext } from "@/lib/portal/event-context.server";

export async function loader({ request }: { request: Request }) {
  const { academy } = await requireAcademyUser(request);
  const eventContext = await getPortalActiveEventReadinessContext(request);
  const selectedEventId = eventContext.selectedEvent?.id ?? null;

  if (!selectedEventId) {
    throw new Response("No hay un evento activo para crear coreografías.", {
      status: 404,
    });
  }

  return loadCreateChoreographyDialogData({
    academyId: academy.id,
    eventId: selectedEventId,
  });
}

export default function PortalCoreografiasCreateRoute() {
  return null;
}

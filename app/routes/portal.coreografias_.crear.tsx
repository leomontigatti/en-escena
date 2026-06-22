import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import { getChoreographyRegistrationInitialOptions } from "@/lib/events/bases.server";
import { listDancersForAcademy } from "@/lib/portal/dancers.server";
import { getPortalActiveEventReadinessContext } from "@/lib/portal/event-context.server";
import { listAcademyProfessors } from "@/lib/portal/professors.server";

export async function loader({ request }: { request: Request }) {
  const { academy } = await requireAcademyUser(request);
  const eventContext = await getPortalActiveEventReadinessContext(request);
  const selectedEventId = eventContext.selectedEvent?.id ?? null;

  if (!selectedEventId) {
    throw new Response("No hay un evento activo para crear coreografías.", {
      status: 404,
    });
  }

  const [activeDancers, activeProfessors, registrationBaseOptions] =
    await Promise.all([
      listDancersForAcademy(academy.id, { status: "active" }),
      listAcademyProfessors(academy.id, { status: "active" }),
      getChoreographyRegistrationInitialOptions(selectedEventId),
    ]);

  return {
    eventId: selectedEventId,
    activeDancers,
    activeProfessors,
    registrationBaseOptions,
  };
}

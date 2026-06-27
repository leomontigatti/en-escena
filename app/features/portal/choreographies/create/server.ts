import { getChoreographyRegistrationInitialOptions } from "@/lib/events/bases.server";
import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import { listDancersForAcademy } from "@/lib/portal/dancers.server";
import { getPortalActiveEventReadinessContext } from "@/lib/portal/event-context.server";
import { listAcademyProfessors } from "@/lib/portal/professors.server";

export async function loadCreateChoreographyRouteData(request: Request) {
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

async function loadCreateChoreographyDialogData(input: {
  academyId: string;
  eventId: string;
}) {
  const [activeDancers, activeProfessors, registrationBaseOptions] =
    await Promise.all([
      listDancersForAcademy(input.academyId, { status: "active" }),
      listAcademyProfessors(input.academyId, { status: "active" }),
      getChoreographyRegistrationInitialOptions(input.eventId),
    ]);

  return {
    activeDancers,
    activeProfessors,
    registrationBaseOptions,
  };
}

export type CreateChoreographyDialogLoaderData = Awaited<
  ReturnType<typeof loadCreateChoreographyDialogData>
>;

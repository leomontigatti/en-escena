import { getChoreographyRegistrationInitialOptions } from "@/lib/events/bases.server";
import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import {
  listDancerOptionsForChoreography,
  listProfessorOptionsForChoreography,
} from "@/lib/choreographies/choreography-roster-options.server";
import { getPortalActiveEventReadinessContext } from "@/lib/portal/event-context.server";

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
  // A choreography being created has no roster yet, so the pickers get an empty
  // linked set: the shared eligibility rule then offers exactly the academy's
  // active people, which is what creation has always shown. The pickers sort
  // case-insensitively, which is the order the list modules used before, so
  // switching readers keeps the order creation has always shown too.
  const [activeDancers, activeProfessors, registrationBaseOptions] =
    await Promise.all([
      listDancerOptionsForChoreography(input.academyId, []),
      listProfessorOptionsForChoreography(input.academyId, []),
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

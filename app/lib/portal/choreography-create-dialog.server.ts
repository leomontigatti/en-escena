import { getChoreographyRegistrationInitialOptions } from "@/lib/events/bases.server";
import { listDancersForAcademy } from "@/lib/portal/dancers.server";
import { listAcademyProfessors } from "@/lib/portal/professors.server";

export async function loadCreateChoreographyDialogData(input: {
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

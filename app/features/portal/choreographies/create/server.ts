import { redirect } from "react-router";

import { getChoreographyRegistrationInitialOptions } from "@/lib/events/bases.server";
import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import {
  listDancerOptionsForChoreography,
  listProfessorOptionsForChoreography,
} from "@/lib/choreographies/choreography-roster-options.server";
import { createChoreographyRegistration } from "@/lib/choreographies/registration-confirmation.server";
import { resolveChoreographyRegistrationOperation } from "@/lib/choreographies/registration-resolution.server";
import {
  CREATE_CHOREOGRAPHY_INTENT,
  RESOLVE_CHOREOGRAPHY_REGISTRATION_INTENT,
  type CalculationActionData,
  type CreateActionData,
} from "@/features/portal/choreographies/create/flow";
import { getPortalChoreographyCreationAvailability } from "@/lib/portal/choreography-creation-availability";
import { getPortalActiveEventReadinessContext } from "@/lib/portal/event-context.server";
import { readAcknowledgedDuplicateIds } from "@/lib/shared/duplicate-warning";

const choreographiesListPath = "/portal/coreografias";

export async function loadCreateChoreographyRouteData(request: Request) {
  const { academy } = await requireAcademyUser(request);
  const eventContext = await getPortalActiveEventReadinessContext(request);
  const eventId = eventContext.selectedEvent?.id ?? null;

  if (!eventId) {
    throw redirect(choreographiesListPath);
  }

  // A choreography being created has no roster yet, so the pickers get an empty
  // linked set: the shared eligibility rule then offers exactly the academy's
  // active people, which is what creation has always shown. The pickers sort
  // case-insensitively, which is the order the list modules used before, so
  // switching readers keeps the order creation has always shown too.
  const [activeDancers, activeProfessors, registrationBaseOptions] =
    await Promise.all([
      listDancerOptionsForChoreography(academy.id, []),
      listProfessorOptionsForChoreography(academy.id, []),
      getChoreographyRegistrationInitialOptions(eventId),
    ]);

  // The same rule that disables the list's button: a page reached by its URL
  // while registration is not possible would be a wizard that cannot be saved.
  const availability = getPortalChoreographyCreationAvailability({
    activeDancerCount: activeDancers.length,
    eventContext,
  });

  if (!availability.canCreate) {
    throw redirect(choreographiesListPath);
  }

  return {
    activeDancers,
    activeProfessors,
    eventId,
    registrationBaseOptions,
  };
}

export type CreateChoreographyRouteData = Awaited<
  ReturnType<typeof loadCreateChoreographyRouteData>
>;

export async function handleCreateChoreographyAction(request: Request) {
  const { academy } = await requireAcademyUser(request);
  const formData = await request.formData();
  const intent = readFormString(formData, "intent");

  if (intent === RESOLVE_CHOREOGRAPHY_REGISTRATION_INTENT) {
    return {
      intent,
      result: await resolveChoreographyRegistrationOperation({
        academyId: academy.id,
        eventId: readFormString(formData, "eventId"),
        modalityId: readFormString(formData, "modalityId"),
        submodalityId: readOptionalFormString(formData, "submodalityId"),
        dancerIds: readFormStringArray(formData, "dancerIds"),
      }),
    } satisfies CalculationActionData;
  }

  if (intent === CREATE_CHOREOGRAPHY_INTENT) {
    const result = await createChoreographyRegistration({
      academyId: academy.id,
      acknowledgedDuplicateIds: readAcknowledgedDuplicateIds(formData),
      eventId: readFormString(formData, "eventId"),
      name: readFormString(formData, "name"),
      modalityId: readFormString(formData, "modalityId"),
      submodalityId: readOptionalFormString(formData, "submodalityId"),
      dancerIds: readFormStringArray(formData, "dancerIds"),
      professorIds: readFormStringArray(formData, "professorIds"),
      experienceLevelId: readOptionalFormString(formData, "experienceLevelId"),
      scheduleCapacityId: readFormString(formData, "scheduleCapacityId"),
    });

    if (!result.ok) {
      return {
        intent,
        result,
      } satisfies CreateActionData;
    }

    throw redirect(`${choreographiesListPath}?creada=1`);
  }

  throw new Response("Acción no soportada.", { status: 400 });
}

function readFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

function readOptionalFormString(formData: FormData, key: string) {
  const value = readFormString(formData, key).trim();

  return value.length > 0 ? value : null;
}

function readFormStringArray(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .flatMap((value) => (typeof value === "string" && value ? [value] : []));
}

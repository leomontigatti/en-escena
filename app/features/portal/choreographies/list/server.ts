import { redirect } from "react-router";

import { createChoreographyRegistration } from "@/lib/choreographies/registration-confirmation.server";
import { resolveChoreographyRegistrationOperation } from "@/lib/choreographies/registration-resolution.server";
import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import {
  CREATE_CHOREOGRAPHY_INTENT,
  RESOLVE_CHOREOGRAPHY_REGISTRATION_INTENT,
} from "@/features/portal/choreographies/create/flow";
import type {
  CalculationActionData,
  CreateActionData,
} from "@/features/portal/choreographies/create/flow";
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

export async function handlePortalChoreographiesListAction(request: Request) {
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

    throw redirect("/portal/coreografias?creada=1");
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

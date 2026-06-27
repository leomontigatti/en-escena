import { redirect } from "react-router";

import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import {
  choreographyEditSchema,
  resolveChoreographyDancersIntent,
  rosterEditorReviewMessage,
  updateChoreographyIntent,
  type ChoreographyRosterEditorActionData,
} from "@/features/portal/choreographies/detail/roster-editor";
import { deleteChoreographyIntent } from "@/features/portal/choreographies/detail/shared";
import {
  deleteChoreography,
  findChoreographyForAcademyEvent,
  getChoreographyDeletionAvailability,
} from "@/lib/portal/choreographies.server";
import {
  listDancerOptionsForChoreography,
  listProfessorOptionsForChoreography,
  resolveChoreographyDancers,
  updateChoreography,
} from "@/lib/portal/choreography-roster.server";
import { getPortalActiveEventReadinessContext } from "@/lib/portal/event-context.server";

const choreographyDeletedSearchParam = "eliminada";
const routeNotificationSearchParam = "notificacion";
const choreographySavedNotification = "coreografia-guardada";
const choreographyNotFoundMessage = "No encontramos esa Coreografía.";
const readOnlyEventMessage = "Este Evento es de solo lectura.";
const unsupportedActionMessage = "Acción no soportada.";

type DancerResolutionActionData = {
  intent: typeof resolveChoreographyDancersIntent;
  result: Awaited<ReturnType<typeof resolveChoreographyDancers>>;
};

type ActionData =
  | ChoreographyRosterEditorActionData
  | DancerResolutionActionData;

type ChoreographyRosterSummary = {
  id: string;
  dancers: Array<{ id: string }>;
  professors: Array<{ id: string }>;
};

export async function loadPortalChoreographyDetail({
  request,
  params,
}: {
  request: Request;
  params: { choreographyId?: string };
}) {
  const { academy } = await requireAcademyUser(request);
  const choreographyId = readChoreographyId(params);
  const eventContext = await getPortalActiveEventReadinessContext(request);
  const selectedEventId = eventContext.selectedEvent?.id;

  if (!selectedEventId) {
    throw new Response(choreographyNotFoundMessage, { status: 404 });
  }

  const choreography = await findChoreographyForAcademyEvent(
    academy.id,
    selectedEventId,
    choreographyId,
    {
      isRegistrationOpen: eventContext.isRegistrationOpen,
    },
  );

  if (!choreography) {
    throw new Response(choreographyNotFoundMessage, { status: 404 });
  }

  const { availableDancers, availableProfessors } =
    await loadChoreographyRosterEditorOptions({
      academyId: academy.id,
      choreography,
    });

  return {
    choreography,
    dancerEditingEligibility: choreography.dancerEditingEligibility,
    availableDancers,
    availableProfessors,
    deletionAvailability: getChoreographyDeletionAvailability({
      isReadOnly: eventContext.isReadOnly,
      isRegistrationOpen: eventContext.isRegistrationOpen,
    }),
    eventContext,
    successMessage: null,
  };
}

export async function handlePortalChoreographyDetailRouteAction({
  request,
  params,
}: {
  request: Request;
  params: { choreographyId?: string };
}) {
  const { academy } = await requireAcademyUser(request);
  const choreographyId = readChoreographyId(params);
  const eventContext = await getPortalActiveEventReadinessContext(request);
  const selectedEventId = eventContext.selectedEvent?.id;

  if (!selectedEventId) {
    throw new Response(choreographyNotFoundMessage, { status: 404 });
  }

  if (eventContext.isReadOnly) {
    throw new Response(readOnlyEventMessage, { status: 403 });
  }

  return await handlePortalChoreographyDetailAction({
    academyId: academy.id,
    choreographyId,
    eventId: selectedEventId,
    formData: await request.formData(),
    isRegistrationOpen: eventContext.isRegistrationOpen,
  });
}

export async function loadChoreographyRosterEditorOptions(input: {
  academyId: string;
  choreography: ChoreographyRosterSummary;
}) {
  const [availableProfessors, availableDancers] = await Promise.all([
    listProfessorOptionsForChoreography(
      input.academyId,
      input.choreography.professors.map((professor) => professor.id),
    ),
    listDancerOptionsForChoreography(
      input.academyId,
      input.choreography.dancers.map((dancer) => dancer.id),
    ),
  ]);

  return {
    availableDancers,
    availableProfessors,
  };
}

async function handlePortalChoreographyDetailAction(input: {
  academyId: string;
  choreographyId: string;
  eventId: string;
  formData: FormData;
  isRegistrationOpen: boolean;
}) {
  const intent = readFormString(input.formData, "intent");

  if (intent === resolveChoreographyDancersIntent) {
    return {
      intent,
      result: await resolveChoreographyDancers({
        academyId: input.academyId,
        choreographyId: input.choreographyId,
        dancerIds: readFormStringArray(input.formData, "dancerIds"),
        eventId: input.eventId,
        isRegistrationOpen: input.isRegistrationOpen,
      }),
    } satisfies DancerResolutionActionData;
  }

  if (intent === updateChoreographyIntent) {
    return await handleUpdateChoreographyAction({
      academyId: input.academyId,
      choreographyId: input.choreographyId,
      dancerIds: readFormStringArray(input.formData, "dancerIds"),
      eventId: input.eventId,
      experienceLevelId: readOptionalFormString(
        input.formData,
        "experienceLevelId",
      ),
      isRegistrationOpen: input.isRegistrationOpen,
      professorIds: readFormStringArray(input.formData, "professorIds"),
      scheduleCapacityId: readOptionalFormString(
        input.formData,
        "scheduleCapacityId",
      ),
    });
  }

  if (intent === deleteChoreographyIntent) {
    assertDeleteConfirmationMatches(input.formData, input.choreographyId);

    return await handleDeleteChoreographyAction({
      academyId: input.academyId,
      choreographyId: input.choreographyId,
      eventId: input.eventId,
    });
  }

  throw new Response(unsupportedActionMessage, { status: 400 });
}

function readFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

function readFormStringArray(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .flatMap((value) => (typeof value === "string" && value ? [value] : []));
}

function readOptionalFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" && value.length > 0 ? value : null;
}

async function handleUpdateChoreographyAction(input: {
  academyId: string;
  choreographyId: string;
  dancerIds: string[];
  eventId: string;
  experienceLevelId: string | null;
  isRegistrationOpen: boolean;
  professorIds: string[];
  scheduleCapacityId: string | null;
}) {
  const parsed = choreographyEditSchema.safeParse({
    dancerIds: input.dancerIds,
    professorIds: input.professorIds,
    scheduleCapacityId: input.scheduleCapacityId ?? "",
  });

  if (!parsed.success) {
    return {
      status: "update-error" as const,
      section: "dancers" as const,
      fieldErrors: {
        dancerIds:
          parsed.error.flatten().fieldErrors.dancerIds?.[0] ?? undefined,
        scheduleCapacityId:
          parsed.error.flatten().fieldErrors.scheduleCapacityId?.[0] ??
          undefined,
      },
      message: rosterEditorReviewMessage,
      selectedDancerIds: input.dancerIds,
      selectedProfessorIds: input.professorIds,
      selectedExperienceLevelId: input.experienceLevelId,
      selectedScheduleCapacityId: input.scheduleCapacityId ?? undefined,
    } satisfies ActionData;
  }

  const result = await updateChoreography({
    academyId: input.academyId,
    choreographyId: input.choreographyId,
    dancerIds: parsed.data.dancerIds,
    eventId: input.eventId,
    experienceLevelId: input.experienceLevelId,
    isRegistrationOpen: input.isRegistrationOpen,
    professorIds: input.professorIds,
    scheduleCapacityId: parsed.data.scheduleCapacityId,
  });

  if (!result.ok) {
    return {
      status: "update-error" as const,
      section: result.section,
      fieldErrors: result.fieldErrors,
      message: result.message,
      selectedDancerIds: parsed.data.dancerIds,
      selectedProfessorIds: input.professorIds,
      selectedExperienceLevelId: input.experienceLevelId,
      selectedScheduleCapacityId: parsed.data.scheduleCapacityId,
    } satisfies ActionData;
  }

  return redirect(
    `/portal/coreografias/${input.choreographyId}?${routeNotificationSearchParam}=${choreographySavedNotification}`,
  );
}

async function handleDeleteChoreographyAction(input: {
  academyId: string;
  choreographyId: string;
  eventId: string;
}) {
  await deleteChoreography({
    academyId: input.academyId,
    choreographyId: input.choreographyId,
    eventId: input.eventId,
  });

  return redirect(`/portal/coreografias?${choreographyDeletedSearchParam}=1`);
}

function assertDeleteConfirmationMatches(
  formData: FormData,
  choreographyId: string,
) {
  if (formData.get("confirmDeletion") !== choreographyId) {
    throw new Response(unsupportedActionMessage, { status: 400 });
  }
}

function readChoreographyId(params: { choreographyId?: string }) {
  if (!params.choreographyId) {
    throw new Response(choreographyNotFoundMessage, { status: 404 });
  }

  return params.choreographyId;
}

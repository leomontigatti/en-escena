import { redirect } from "react-router";

import {
  choreographyEditSchema,
  resolveChoreographyDancersIntent,
  rosterEditorReviewMessage,
  updateChoreographyIntent,
  type CoreografiaPeopleEditorActionData,
} from "@/lib/portal/coreografia-people-editor";
import { deleteChoreographyIntent } from "@/lib/portal/coreografia-detail.shared";
import { deleteChoreography } from "@/lib/portal/choreographies.server";
import {
  listDancerOptionsForChoreography,
  listProfessorOptionsForChoreography,
  resolveChoreographyDancers,
  updateChoreography,
} from "@/lib/portal/choreography-people.server";

const choreographyDeletedSearchParam = "eliminada";
const routeNotificationSearchParam = "notificacion";
const choreographySavedNotification = "coreografia-guardada";
const unsupportedActionMessage = "Acción no soportada.";

type DancerResolutionActionData = {
  intent: typeof resolveChoreographyDancersIntent;
  result: Awaited<ReturnType<typeof resolveChoreographyDancers>>;
};

type ActionData =
  | CoreografiaPeopleEditorActionData
  | DancerResolutionActionData;

type ChoreographyPeopleSummary = {
  id: string;
  dancers: Array<{ id: string }>;
  professors: Array<{ id: string }>;
};

export async function loadCoreografiaPeopleEditorOptions(input: {
  academyId: string;
  choreography: ChoreographyPeopleSummary;
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

export async function handlePortalCoreografiaDetalleAction(input: {
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

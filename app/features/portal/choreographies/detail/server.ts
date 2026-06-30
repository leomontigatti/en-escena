import { redirect } from "react-router";

import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import {
  choreographyMusicInvalidTypeMessage,
  choreographyMusicMaxFileSizeMessage,
  choreographyMusicPresentationBlockedMessage,
  choreographyMusicUploadErrorMessage,
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
  loadChoreographyMusicDownloadUrl,
  updateChoreographyMusic,
} from "@/lib/portal/choreography-music.server";
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

  const musicDownloadUrl = await loadChoreographyMusicDownloadUrl(
    choreography.musicStorageKey,
  );
  const { availableDancers, availableProfessors } =
    await loadChoreographyRosterEditorOptions({
      academyId: academy.id,
      choreography,
    });

  return {
    choreography: {
      ...choreography,
      musicDownloadUrl,
    },
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
      musicFile: readOptionalFormFile(input.formData, "musicFile"),
      musicStorageKey: readFormString(input.formData, "musicStorageKey"),
      musicWasSubmitted: input.formData.has("musicStorageKey"),
      musicValidationError: readFormString(
        input.formData,
        "musicFileValidationError",
      ),
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

function readOptionalFormFile(formData: FormData, key: string) {
  const value = formData.get(key);

  if (!(value instanceof File) || value.size === 0) {
    return null;
  }

  return value;
}

async function handleUpdateChoreographyAction(input: {
  academyId: string;
  choreographyId: string;
  dancerIds: string[];
  eventId: string;
  experienceLevelId: string | null;
  isRegistrationOpen: boolean;
  musicFile: File | null;
  musicStorageKey: string;
  musicWasSubmitted: boolean;
  musicValidationError: string;
  professorIds: string[];
  scheduleCapacityId: string | null;
}) {
  if (input.musicValidationError) {
    return buildMusicUpdateError(input, input.musicValidationError);
  }

  const parsed = choreographyEditSchema.safeParse({
    dancerIds: input.dancerIds,
    musicStorageKey: input.musicStorageKey,
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
      selectedMusicStorageKey: input.musicStorageKey,
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
      selectedMusicStorageKey: parsed.data.musicStorageKey ?? "",
      selectedProfessorIds: input.professorIds,
      selectedExperienceLevelId: input.experienceLevelId,
      selectedScheduleCapacityId: parsed.data.scheduleCapacityId,
    } satisfies ActionData;
  }

  if (input.musicWasSubmitted || input.musicFile) {
    try {
      const musicResult = await updateChoreographyMusic({
        academyId: input.academyId,
        choreographyId: input.choreographyId,
        eventId: input.eventId,
        file: input.musicFile,
        submittedStorageKey: parsed.data.musicStorageKey ?? "",
      });

      if (!musicResult.ok) {
        return buildMusicUpdateError(input, musicResult.message);
      }
    } catch (error) {
      return buildMusicUpdateError(input, getMusicUploadErrorMessage(error));
    }
  }

  return redirect(
    `/portal/coreografias/${input.choreographyId}?${routeNotificationSearchParam}=${choreographySavedNotification}`,
  );
}

function buildMusicUpdateError(
  input: {
    dancerIds: string[];
    experienceLevelId: string | null;
    musicStorageKey: string;
    professorIds: string[];
    scheduleCapacityId: string | null;
  },
  message: string,
) {
  return {
    status: "update-error" as const,
    section: "music" as const,
    message,
    selectedDancerIds: input.dancerIds,
    selectedMusicStorageKey: input.musicStorageKey,
    selectedProfessorIds: input.professorIds,
    selectedExperienceLevelId: input.experienceLevelId,
    selectedScheduleCapacityId: input.scheduleCapacityId ?? undefined,
  } satisfies ActionData;
}

function getMusicUploadErrorMessage(error: unknown) {
  if (
    error instanceof Error &&
    error.message === "Choreography music must be 50 MB or smaller."
  ) {
    return choreographyMusicMaxFileSizeMessage;
  }

  if (
    error instanceof Error &&
    error.message ===
      "Choreography music must be an MP3, M4A, WAV, or OGG file."
  ) {
    return choreographyMusicInvalidTypeMessage;
  }

  if (
    error instanceof Error &&
    error.message === choreographyMusicPresentationBlockedMessage
  ) {
    return choreographyMusicPresentationBlockedMessage;
  }

  return choreographyMusicUploadErrorMessage;
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

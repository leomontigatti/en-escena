import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import {
  choreographyMusicInvalidTypeMessage,
  choreographyMusicMaxFileSizeMessage,
  choreographyMusicPresentationBlockedMessage,
  choreographyMusicUploadErrorMessage,
  updateChoreographyIntent,
  type PortalChoreographyMusicActionData,
} from "@/features/portal/choreographies/detail/music-editor.shared";
import { deleteChoreographyIntent } from "@/features/portal/choreographies/detail/shared";
import { findChoreographyForAcademyEvent } from "@/lib/portal/choreographies.server";
import {
  loadChoreographyMusicDownloadUrl,
  updateChoreographyMusic,
} from "@/lib/portal/choreography-music.server";
import { getPortalActiveEventReadinessContext } from "@/lib/portal/event-context.server";
import { redirectWithFlashNotification } from "@/lib/shared/flash-notification.server";

const choreographySavedNotification = "coreografia-guardada";
const choreographyNotFoundMessage = "No encontramos esa coreografía.";
const readOnlyEventMessage = "Este evento es de solo lectura.";
const unsupportedActionMessage = "Acción no soportada.";
const academyRosterRemovedMessage =
  "Las academias solo pueden editar la música desde el portal.";

type ParsedMusicUpdateAction = {
  academyId: string;
  choreographyId: string;
  eventId: string;
  musicFile: File | null;
  musicStorageKey: string;
  musicWasSubmitted: boolean;
  musicValidationError: string;
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
  );

  if (!choreography) {
    throw new Response(choreographyNotFoundMessage, { status: 404 });
  }

  const musicDownloadUrl = await loadChoreographyMusicDownloadUrl(
    choreography.musicStorageKey,
  );

  return {
    choreography: {
      ...choreography,
      musicDownloadUrl,
    },
    eventContext,
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

  const action = parsePortalChoreographyDetailAction({
    academyId: academy.id,
    choreographyId,
    eventId: selectedEventId,
    formData: await request.formData(),
  });

  return await executeMusicUpdateAction(action);
}

function parsePortalChoreographyDetailAction(input: {
  academyId: string;
  choreographyId: string;
  eventId: string;
  formData: FormData;
}): ParsedMusicUpdateAction {
  const intent = readFormString(input.formData, "intent");

  if (intent === deleteChoreographyIntent) {
    throw new Response(academyRosterRemovedMessage, { status: 403 });
  }

  if (intent !== updateChoreographyIntent) {
    throw new Response(unsupportedActionMessage, { status: 400 });
  }

  return {
    academyId: input.academyId,
    choreographyId: input.choreographyId,
    eventId: input.eventId,
    musicFile: readOptionalFormFile(input.formData, "musicFile"),
    musicStorageKey: readFormString(input.formData, "musicStorageKey"),
    musicWasSubmitted: input.formData.has("musicStorageKey"),
    musicValidationError: readFormString(
      input.formData,
      "musicFileValidationError",
    ),
  };
}

async function executeMusicUpdateAction(
  action: ParsedMusicUpdateAction,
): Promise<PortalChoreographyMusicActionData | Response> {
  if (action.musicValidationError) {
    return buildUpdateError(action, action.musicValidationError);
  }

  if (!action.musicWasSubmitted && !action.musicFile) {
    return buildUpdateError(action, choreographyMusicUploadErrorMessage);
  }

  try {
    const musicResult = await updateChoreographyMusic({
      academyId: action.academyId,
      choreographyId: action.choreographyId,
      eventId: action.eventId,
      file: action.musicFile,
      submittedStorageKey: action.musicStorageKey,
    });

    if (!musicResult.ok) {
      return buildUpdateError(action, musicResult.message);
    }
  } catch (error) {
    return buildUpdateError(action, getMusicUploadErrorMessage(error));
  }

  return redirectWithFlashNotification(
    `/portal/coreografias/${action.choreographyId}`,
    choreographySavedNotification,
  );
}

function buildUpdateError(
  action: ParsedMusicUpdateAction,
  message: string,
): PortalChoreographyMusicActionData {
  return {
    status: "update-error",
    message,
    selectedMusicStorageKey: action.musicStorageKey,
  };
}

function readFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

function readOptionalFormFile(formData: FormData, key: string) {
  const value = formData.get(key);

  if (!(value instanceof File) || value.size === 0) {
    return null;
  }

  return value;
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

function readChoreographyId(params: { choreographyId?: string }) {
  if (!params.choreographyId) {
    throw new Response(choreographyNotFoundMessage, { status: 404 });
  }

  return params.choreographyId;
}

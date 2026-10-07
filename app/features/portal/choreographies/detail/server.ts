import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import {
  choreographyMusicUploadErrorMessage,
  updateChoreographyIntent,
  type PortalChoreographyMusicActionData,
} from "@/features/portal/choreographies/detail/music-editor.shared";
import { choreographyNotFoundMessage } from "@/lib/choreographies/choreography-messages";
import { findChoreographyForAcademyEvent } from "@/lib/portal/choreographies.server";
import { updateChoreographyMusic } from "@/lib/portal/choreography-music.server";
import { updateChoreographyProfessionalEvaluation } from "@/lib/portal/choreography-professional-evaluation.server";
import {
  createDefaultChoreographyMusicStorage,
  loadChoreographyMusicDownloadUrl,
} from "@/lib/storage/choreography-music.server";
import { getPortalActiveEventReadinessContext } from "@/lib/portal/event-context.server";
import { notificationToasts } from "@/lib/shared/notification-toasts";

const choreographySavedMessage =
  notificationToasts["choreography-saved"].message;
const readOnlyEventMessage = "Este evento es de solo lectura.";
const unsupportedActionMessage = "Acción no soportada.";

type ParsedMusicUpdateAction = {
  academyId: string;
  choreographyId: string;
  eventId: string;
  musicFile: File | null;
  musicStorageKey: string;
  musicWasSubmitted: boolean;
  musicValidationError: string;
  /** `null` when the form did not carry the switch. */
  professionalEvaluation: boolean | null;
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

  const musicDownloadUrl = await loadChoreographyMusicDownloadUrl({
    storage: createDefaultChoreographyMusicStorage(),
    storageKey: choreography.musicStorageKey,
  });

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
    professionalEvaluation: readOptionalFormBoolean(
      input.formData,
      "professionalEvaluation",
    ),
  };
}

async function executeMusicUpdateAction(
  action: ParsedMusicUpdateAction,
): Promise<PortalChoreographyMusicActionData> {
  if (action.musicValidationError) {
    return buildRefusedSave(action, action.musicValidationError);
  }

  if (!action.musicWasSubmitted && !action.musicFile) {
    return buildRefusedSave(action, choreographyMusicUploadErrorMessage);
  }

  // The switch first: it has no side effect to undo, while a music upload that
  // fails after it still leaves the answer saved and shown by the revalidation.
  if (action.professionalEvaluation !== null) {
    const evaluationResult = await updateChoreographyProfessionalEvaluation({
      academyId: action.academyId,
      choreographyId: action.choreographyId,
      eventId: action.eventId,
      professionalEvaluation: action.professionalEvaluation,
    });

    if (!evaluationResult.ok) {
      return buildRefusedSave(action, evaluationResult.message);
    }
  }

  try {
    const musicResult = await updateChoreographyMusic({
      academyId: action.academyId,
      choreographyId: action.choreographyId,
      eventId: action.eventId,
      file: action.musicFile,
      storage: createDefaultChoreographyMusicStorage(),
      submittedStorageKey: action.musicStorageKey,
    });

    if (!musicResult.ok) {
      return buildRefusedSave(action, musicResult.message);
    }
  } catch {
    // Everything the academy can act on now arrives as `ok: false` with its own
    // Spanish copy. What is left here is infrastructure failing, which no
    // rewording of theirs can fix.
    return buildRefusedSave(action, choreographyMusicUploadErrorMessage);
  }

  return {
    status: "success",
    message: choreographySavedMessage,
  };
}

function buildRefusedSave(
  action: ParsedMusicUpdateAction,
  message: string,
): PortalChoreographyMusicActionData {
  return {
    status: "error",
    message,
    selectedMusicStorageKey: action.musicStorageKey,
  };
}

function readFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

/** `"true"` or `"false"` as the hidden input writes it; anything else, absent. */
function readOptionalFormBoolean(formData: FormData, key: string) {
  const value = formData.get(key);

  return value === "true" ? true : value === "false" ? false : null;
}

function readOptionalFormFile(formData: FormData, key: string) {
  const value = formData.get(key);

  if (!(value instanceof File) || value.size === 0) {
    return null;
  }

  return value;
}

function readChoreographyId(params: { choreographyId?: string }) {
  if (!params.choreographyId) {
    throw new Response(choreographyNotFoundMessage, { status: 404 });
  }

  return params.choreographyId;
}

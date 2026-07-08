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

const routeNotificationSearchParam = "notificacion";
const choreographySavedNotification = "coreografia-guardada";
const choreographyNotFoundMessage = "No encontramos esa Coreografía.";
const readOnlyEventMessage = "Este Evento es de solo lectura.";
const unsupportedActionMessage = "Acción no soportada.";
const academyDeletionRemovedMessage =
  "Las academias no pueden eliminar coreografías desde el portal.";

type DancerResolutionActionData = {
  intent: typeof resolveChoreographyDancersIntent;
  result: Awaited<ReturnType<typeof resolveChoreographyDancers>>;
};

type ActionData =
  | ChoreographyRosterEditorActionData
  | DancerResolutionActionData;

type UpdateActionData = NonNullable<ChoreographyRosterEditorActionData>;
type UpdateErrorSection = UpdateActionData["section"];
type UpdateErrorFieldErrors = Extract<
  UpdateActionData,
  { section: "dancers" }
>["fieldErrors"];

type UpdateActionSelection = {
  dancerIds: string[];
  experienceLevelId: string | null;
  musicStorageKey: string;
  professorIds: string[];
  scheduleCapacityId: string | null;
};

type ParsedPortalChoreographyDetailAction =
  | {
      intent: typeof resolveChoreographyDancersIntent;
      academyId: string;
      choreographyId: string;
      dancerIds: string[];
      eventId: string;
      isRegistrationOpen: boolean;
    }
  | ({
      intent: typeof updateChoreographyIntent;
      academyId: string;
      choreographyId: string;
      eventId: string;
      isRegistrationOpen: boolean;
      musicFile: File | null;
      musicWasSubmitted: boolean;
      musicValidationError: string;
    } & UpdateActionSelection);

type PortalChoreographyDetailActionResult =
  | {
      kind: "dancer-resolution";
      result: Awaited<ReturnType<typeof resolveChoreographyDancers>>;
    }
  | ({
      kind: "update-error";
      error: {
        fieldErrors?: UpdateErrorFieldErrors;
        message: string;
        section: UpdateErrorSection;
      };
    } & UpdateActionSelection)
  | {
      kind: "saved";
      choreographyId: string;
    };

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

  const parsedAction = parsePortalChoreographyDetailAction({
    academyId: academy.id,
    choreographyId,
    eventId: selectedEventId,
    formData: await request.formData(),
    isRegistrationOpen: eventContext.isRegistrationOpen,
  });

  const result = await executePortalChoreographyDetailAction(parsedAction);

  return adaptPortalChoreographyDetailActionResult(result);
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

function parsePortalChoreographyDetailAction(input: {
  academyId: string;
  choreographyId: string;
  eventId: string;
  formData: FormData;
  isRegistrationOpen: boolean;
}): ParsedPortalChoreographyDetailAction {
  const intent = readFormString(input.formData, "intent");

  if (intent === resolveChoreographyDancersIntent) {
    return {
      intent,
      academyId: input.academyId,
      choreographyId: input.choreographyId,
      dancerIds: readFormStringArray(input.formData, "dancerIds"),
      eventId: input.eventId,
      isRegistrationOpen: input.isRegistrationOpen,
    };
  }

  if (intent === updateChoreographyIntent) {
    return {
      intent,
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
    };
  }

  if (intent === deleteChoreographyIntent) {
    throw new Response(academyDeletionRemovedMessage, { status: 403 });
  }

  throw new Response(unsupportedActionMessage, { status: 400 });
}

async function executePortalChoreographyDetailAction(
  action: ParsedPortalChoreographyDetailAction,
): Promise<PortalChoreographyDetailActionResult> {
  if (action.intent === resolveChoreographyDancersIntent) {
    return {
      kind: "dancer-resolution",
      result: await resolveChoreographyDancers({
        academyId: action.academyId,
        choreographyId: action.choreographyId,
        dancerIds: action.dancerIds,
        eventId: action.eventId,
        isRegistrationOpen: action.isRegistrationOpen,
      }),
    };
  }

  if (action.intent === updateChoreographyIntent) {
    return await executeUpdateChoreographyAction(action);
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

async function executeUpdateChoreographyAction(
  input: Extract<
    ParsedPortalChoreographyDetailAction,
    { intent: typeof updateChoreographyIntent }
  >,
): Promise<PortalChoreographyDetailActionResult> {
  const selection = getUpdateActionSelection(input);
  const parsedUpdate = parseUpdateChoreographyActionInput(input, selection);

  if (!parsedUpdate.ok) {
    return parsedUpdate.result;
  }

  const updateError = await persistChoreographyUpdate(input, parsedUpdate);

  if (updateError) {
    return updateError;
  }

  const musicError = await updateChoreographyActionMusic(input, parsedUpdate);

  if (musicError) {
    return musicError;
  }

  return {
    kind: "saved",
    choreographyId: input.choreographyId,
  };
}

function parseUpdateChoreographyActionInput(
  input: Extract<
    ParsedPortalChoreographyDetailAction,
    { intent: typeof updateChoreographyIntent }
  >,
  selection: UpdateActionSelection,
) {
  const preflightError = readUpdateChoreographyPreflightError(input, selection);

  if (preflightError) {
    return preflightError;
  }

  const parsed = choreographyEditSchema.safeParse({
    dancerIds: input.dancerIds,
    musicStorageKey: input.musicStorageKey,
    professorIds: input.professorIds,
    scheduleCapacityId: input.scheduleCapacityId ?? "",
  });

  const parsedError = readSubmittedChoreographyEditError(parsed, selection);

  if (parsedError) {
    return parsedError;
  }

  const parsedData = parsed.data!;

  return {
    ok: true as const,
    parsed,
    parsedSelection: {
      ...selection,
      dancerIds: parsedData.dancerIds,
      musicStorageKey: parsedData.musicStorageKey ?? "",
      scheduleCapacityId: parsedData.scheduleCapacityId ?? null,
    } satisfies UpdateActionSelection,
  };
}

function readUpdateChoreographyPreflightError(
  input: Extract<
    ParsedPortalChoreographyDetailAction,
    { intent: typeof updateChoreographyIntent }
  >,
  selection: UpdateActionSelection,
) {
  if (!input.musicValidationError) {
    return null;
  }

  return {
    ok: false as const,
    result: buildUpdateErrorResult(
      selection,
      "music",
      input.musicValidationError,
    ),
  };
}

function readSubmittedChoreographyEditError(
  parsed: ReturnType<typeof choreographyEditSchema.safeParse>,
  selection: UpdateActionSelection,
) {
  if (parsed.success) {
    return null;
  }

  return {
    ok: false as const,
    result: buildUpdateErrorResult(
      selection,
      "dancers",
      rosterEditorReviewMessage,
      {
        dancerIds:
          parsed.error.flatten().fieldErrors.dancerIds?.[0] ?? undefined,
        scheduleCapacityId:
          parsed.error.flatten().fieldErrors.scheduleCapacityId?.[0] ??
          undefined,
      },
    ),
  };
}

async function persistChoreographyUpdate(
  input: Extract<
    ParsedPortalChoreographyDetailAction,
    { intent: typeof updateChoreographyIntent }
  >,
  parsedUpdate: Extract<
    ReturnType<typeof parseUpdateChoreographyActionInput>,
    { ok: true }
  >,
) {
  const parsedData = parsedUpdate.parsed.data!;

  const result = await updateChoreography({
    academyId: input.academyId,
    choreographyId: input.choreographyId,
    dancerIds: parsedData.dancerIds,
    eventId: input.eventId,
    experienceLevelId: input.experienceLevelId,
    isRegistrationOpen: input.isRegistrationOpen,
    professorIds: input.professorIds,
    scheduleCapacityId: parsedData.scheduleCapacityId,
  });

  if (result.ok) {
    return null;
  }

  return buildUpdateErrorResult(
    parsedUpdate.parsedSelection,
    result.section,
    result.message,
    result.fieldErrors,
  );
}

async function updateChoreographyActionMusic(
  input: Extract<
    ParsedPortalChoreographyDetailAction,
    { intent: typeof updateChoreographyIntent }
  >,
  parsedUpdate: Extract<
    ReturnType<typeof parseUpdateChoreographyActionInput>,
    { ok: true }
  >,
) {
  if (!input.musicWasSubmitted && !input.musicFile) {
    return null;
  }

  const parsedData = parsedUpdate.parsed.data!;

  try {
    const musicResult = await updateChoreographyMusic({
      academyId: input.academyId,
      choreographyId: input.choreographyId,
      eventId: input.eventId,
      file: input.musicFile,
      submittedStorageKey: parsedData.musicStorageKey ?? "",
    });

    if (musicResult.ok) {
      return null;
    }

    return buildUpdateErrorResult(
      parsedUpdate.parsedSelection,
      "music",
      musicResult.message,
    );
  } catch (error) {
    return buildUpdateErrorResult(
      parsedUpdate.parsedSelection,
      "music",
      getMusicUploadErrorMessage(error),
    );
  }
}

function getUpdateActionSelection(input: {
  dancerIds: string[];
  experienceLevelId: string | null;
  musicStorageKey: string;
  professorIds: string[];
  scheduleCapacityId: string | null;
}) {
  return {
    dancerIds: input.dancerIds,
    experienceLevelId: input.experienceLevelId,
    musicStorageKey: input.musicStorageKey,
    professorIds: input.professorIds,
    scheduleCapacityId: input.scheduleCapacityId,
  };
}

function buildUpdateErrorResult(
  selection: UpdateActionSelection,
  section: UpdateErrorSection,
  message: string,
  fieldErrors?: UpdateErrorFieldErrors,
) {
  return {
    kind: "update-error" as const,
    error: {
      fieldErrors,
      message,
      section,
    },
    ...selection,
  } satisfies PortalChoreographyDetailActionResult;
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

function adaptPortalChoreographyDetailActionResult(
  result: PortalChoreographyDetailActionResult,
): ActionData | Response {
  if (result.kind === "dancer-resolution") {
    return {
      intent: resolveChoreographyDancersIntent,
      result: result.result,
    };
  }

  if (result.kind === "update-error") {
    return {
      status: "update-error",
      fieldErrors: result.error.fieldErrors,
      message: result.error.message,
      section: result.error.section,
      selectedDancerIds: result.dancerIds,
      selectedMusicStorageKey: result.musicStorageKey,
      selectedProfessorIds: result.professorIds,
      selectedExperienceLevelId: result.experienceLevelId,
      selectedScheduleCapacityId: result.scheduleCapacityId ?? undefined,
    };
  }

  if (result.kind === "saved") {
    return redirect(
      `/portal/coreografias/${result.choreographyId}?${routeNotificationSearchParam}=${choreographySavedNotification}`,
    );
  }
}

function readChoreographyId(params: { choreographyId?: string }) {
  if (!params.choreographyId) {
    throw new Response(choreographyNotFoundMessage, { status: 404 });
  }

  return params.choreographyId;
}

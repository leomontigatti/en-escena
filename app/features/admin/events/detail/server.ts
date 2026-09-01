import { eq } from "drizzle-orm";

import { db } from "@/db";
import { events as eventsTable } from "@/db/schema";
import { requireAdminPanelUser } from "@/lib/auth/internal-navigation.server";
import {
  getEventFormErrorMessage,
  parseEventFormValues,
  readEventFormValues,
} from "@/lib/admin/events/form-values";
import {
  eventDocumentKinds,
  type EventDocumentKind,
} from "@/lib/events/event-documents";
import {
  deleteEventDocument,
  loadEventDocumentSummaries,
  saveEventDocument,
  type EventDocumentMutationResult,
} from "@/lib/events/event-documents.server";
import { createDefaultEventDocumentStorage } from "@/lib/storage/event-documents.server";
import {
  activateEvent,
  deactivateEvent,
  deleteEvent,
  setEventVisibility,
  updateEvent,
  type EventMutationResult,
} from "@/lib/events/management.server";
import { getEventRegistrationReadiness } from "@/lib/events/registration-readiness.server";
import { redirectWithFlashNotification } from "@/lib/shared/flash-notification.server";
import {
  notificationToasts,
  type NotificationKey,
} from "@/lib/shared/notification-toasts";
import {
  eventDocumentFileField,
  eventDocumentKeptField,
  eventDocumentsPresentField,
  keptEventDocumentValue,
  type EventDetailActionData,
  type EventDetailLoaderData,
} from "./shared";

type EventRouteNotification = Extract<
  NotificationKey,
  | "evento-activado"
  | "evento-desactivado"
  | "evento-guardado"
  | "programa-visible"
  | "programa-oculto"
  | "resultados-visibles"
  | "resultados-ocultos"
>;

export async function loadEventDetail(
  request: Request,
  eventId: string | undefined,
) {
  await requireAdminPanelUser(request);

  if (!eventId) {
    throw new Response("No encontramos ese evento.", { status: 404 });
  }

  const [event, registrationReadiness, documents] = await Promise.all([
    loadEvent(eventId),
    getEventRegistrationReadiness(eventId),
    loadEventDocumentSummaries({
      eventId,
      storage: createDefaultEventDocumentStorage(),
    }),
  ]);

  return {
    documents,
    event,
    registrationReadiness,
  } satisfies EventDetailLoaderData;
}

export async function updateAdministrativeEvent(
  request: Request,
  eventId: string | undefined,
) {
  await requireAdminPanelUser(request);

  if (!eventId) {
    throw new Response("No encontramos ese evento.", { status: 404 });
  }

  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  switch (intent) {
    case "update":
      return updateEventAction(eventId, formData);

    case "activate":
      return successOrError(activateEvent(eventId), "evento-activado");

    case "deactivate":
      if (formData.get("confirmDeactivation") !== eventId) {
        return actionError("Confirmá la desactivación del evento.");
      }

      return successOrError(deactivateEvent(eventId), "evento-desactivado");

    case "delete":
      if (formData.get("confirmDeletion") !== eventId) {
        return actionError("Confirmá el borrado del evento.");
      }

      return redirectAfterDeletion(await deleteEvent(eventId));

    case "set-program-visibility": {
      const programVisible = formData.get("value") === "true";

      return updateVisibility(
        eventId,
        {
          programVisible,
        },
        programVisible ? "programa-visible" : "programa-oculto",
      );
    }

    case "set-results-visibility": {
      const resultsVisible = formData.get("value") === "true";

      return updateVisibility(
        eventId,
        {
          resultsVisible,
        },
        resultsVisible ? "resultados-visibles" : "resultados-ocultos",
      );
    }

    default:
      return actionError("No pudimos procesar esa acción.");
  }
}

async function updateEventAction(eventId: string, formData: FormData) {
  const values = readEventFormValues(formData);
  const parsed = parseEventFormValues(values);

  if (!parsed.ok) {
    return {
      status: "error" as const,
      message: "Revisá los datos del evento.",
      fieldErrors: parsed.fieldErrors,
      values,
    };
  }

  const result = await updateEvent(eventId, parsed.input);

  if (!result.ok) {
    const fieldErrors = result.fieldErrors ?? {};

    return {
      status: "error" as const,
      message: getEventFormErrorMessage(fieldErrors, result.error),
      fieldErrors,
      values,
    };
  }

  const documentsResult = await applyEventDocumentChanges(eventId, formData);

  if (!documentsResult.ok) {
    return actionError(documentsResult.message);
  }

  return actionSuccess("evento-guardado");
}

/**
 * The event form carries the three PDFs, so one "Guardar" uploads, replaces and
 * removes them along with the dates. The body always posts
 * `multipart/form-data`: `request.formData()` parses it transparently, which is
 * what lets the files ride on the same submission the rest of the form uses.
 *
 * A body without the marker is left alone. Three absent file inputs and three
 * absent "kept" fields look exactly like "remove all three", and the costly way
 * to be wrong about that is the one that deletes them.
 */
async function applyEventDocumentChanges(
  eventId: string,
  formData: FormData,
): Promise<EventDocumentMutationResult> {
  if (formData.get(eventDocumentsPresentField) !== keptEventDocumentValue) {
    return { ok: true };
  }

  const storage = createDefaultEventDocumentStorage();
  const summaries = await loadEventDocumentSummaries({ eventId, storage });

  for (const kind of eventDocumentKinds) {
    const result = await applyEventDocumentChange({
      eventId,
      formData,
      isUploaded: summaries[kind] !== null,
      kind,
      storage,
    });

    if (!result.ok) {
      return result;
    }
  }

  return { ok: true };
}

async function applyEventDocumentChange({
  eventId,
  formData,
  isUploaded,
  kind,
  storage,
}: {
  eventId: string;
  formData: FormData;
  isUploaded: boolean;
  kind: EventDocumentKind;
  storage: ReturnType<typeof createDefaultEventDocumentStorage>;
}): Promise<EventDocumentMutationResult> {
  const file = formData.get(eventDocumentFileField(kind));

  // A file always wins: choosing one after clearing the field is a replacement,
  // not a removal followed by an upload.
  if (file instanceof File && file.size > 0) {
    return await saveEventDocument({ eventId, file, kind, storage });
  }

  const isKept =
    formData.get(eventDocumentKeptField(kind)) === keptEventDocumentValue;

  if (isUploaded && !isKept) {
    return await deleteEventDocument({ eventId, kind, storage });
  }

  return { ok: true };
}

function updateVisibility(
  eventId: string,
  visibility: Parameters<typeof setEventVisibility>[1],
  notification: EventRouteNotification,
) {
  return successOrError(setEventVisibility(eventId, visibility), notification);
}

async function redirectAfterDeletion(
  result: Awaited<ReturnType<typeof deleteEvent>>,
) {
  if (!result.ok) {
    return actionError(result.error);
  }

  throw await redirectWithFlashNotification(
    "/administracion/eventos",
    "evento-eliminado",
  );
}

// In-place edits on the detail do not redirect: they return
// `{ status: "success" }`, the loader revalidates and the view fires the toast
// directly. See docs/agents/form-feedback.md.
async function successOrError(
  resultPromise: Promise<EventMutationResult>,
  notification: EventRouteNotification,
): Promise<EventDetailActionData> {
  const result = await resultPromise;

  if (!result.ok) {
    return actionError(result.error);
  }

  return actionSuccess(notification);
}

function actionError(message: string): EventDetailActionData {
  return {
    status: "error",
    message,
    fieldErrors: {},
    values: null,
  };
}

function actionSuccess(
  notification: EventRouteNotification,
): EventDetailActionData {
  return {
    status: "success",
    message: notificationToasts[notification].message,
  };
}

async function loadEvent(eventId: string) {
  const event = await db.query.events.findFirst({
    where: eq(eventsTable.id, eventId),
  });

  if (!event) {
    throw new Response("No encontramos ese evento.", { status: 404 });
  }

  return event;
}

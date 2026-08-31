import { eq } from "drizzle-orm";

import { db } from "@/db";
import { events as eventsTable } from "@/db/schema";
import { requireAdminPanelUser } from "@/lib/auth/internal-navigation.server";
import {
  getEventFormErrorMessage,
  parseEventFormValues,
  readEventFormValues,
} from "@/lib/admin/events/form-values";
import { parseEventDocumentKind } from "@/lib/events/event-documents";
import {
  deleteEventDocument,
  loadEventDocumentSummaries,
  saveEventDocument,
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
  deleteEventDocumentIntent,
  uploadEventDocumentIntent,
  type EventDetailActionData,
  type EventDetailLoaderData,
} from "./shared";

type EventRouteNotification = Extract<
  NotificationKey,
  | "documento-evento-cargado"
  | "documento-evento-eliminado"
  | "evento-activado"
  | "evento-desactivado"
  | "evento-guardado"
  | "programa-visible"
  | "programa-oculto"
  | "resultados-visibles"
  | "resultados-ocultos"
>;

const unknownDocumentMessage = "No pudimos reconocer ese documento.";
const missingDocumentFileMessage = "Elegí un archivo para cargar.";

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

    case uploadEventDocumentIntent:
      return uploadDocumentAction(eventId, formData);

    case deleteEventDocumentIntent:
      return deleteDocumentAction(eventId, formData);

    default:
      return actionError("No pudimos procesar esa acción.");
  }
}

// The card posts `multipart/form-data` to this same action: `request.formData()`
// parses a multipart body transparently, so the main event form keeps posting
// url-encoded and a second route does not have to restate the admin gate.
async function uploadDocumentAction(eventId: string, formData: FormData) {
  const kind = parseEventDocumentKind(formData.get("kind"));

  if (!kind) {
    return actionError(unknownDocumentMessage);
  }

  const file = formData.get("documentFile");

  if (!(file instanceof File) || file.size === 0) {
    return actionError(missingDocumentFileMessage);
  }

  const result = await saveEventDocument({
    eventId,
    file,
    kind,
    storage: createDefaultEventDocumentStorage(),
  });

  if (!result.ok) {
    return actionError(result.message);
  }

  return actionSuccess("documento-evento-cargado");
}

async function deleteDocumentAction(eventId: string, formData: FormData) {
  const kind = parseEventDocumentKind(formData.get("kind"));

  if (!kind) {
    return actionError(unknownDocumentMessage);
  }

  const result = await deleteEventDocument({
    eventId,
    kind,
    storage: createDefaultEventDocumentStorage(),
  });

  if (!result.ok) {
    return actionError(result.message);
  }

  return actionSuccess("documento-evento-eliminado");
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

  return actionSuccess("evento-guardado");
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

// Las ediciones en el lugar del detalle no redirigen: retornan
// `{ status: "success" }`, el loader revalida y la vista dispara el toast
// directo. Ver docs/agents/form-feedback.md.
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

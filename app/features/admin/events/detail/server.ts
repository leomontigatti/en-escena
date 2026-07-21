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
  routeNotificationToasts,
  type RouteNotificationKey,
} from "@/lib/shared/route-notification-toasts";
import {
  type AdministrativeEventDetailActionData,
  type AdministrativeEventDetailLoaderData,
} from "./shared";

type EventRouteNotification = Extract<
  RouteNotificationKey,
  | "evento-activado"
  | "evento-desactivado"
  | "evento-guardado"
  | "programa-visible"
  | "programa-oculto"
  | "resultados-visibles"
  | "resultados-ocultos"
>;

export async function loadAdministrativeEventDetail(
  request: Request,
  eventId: string | undefined,
) {
  await requireAdminPanelUser(request);

  if (!eventId) {
    throw new Response("No encontramos ese evento.", { status: 404 });
  }

  const [event, registrationReadiness] = await Promise.all([
    loadEvent(eventId),
    getEventRegistrationReadiness(eventId),
  ]);

  return {
    event,
    registrationReadiness,
  } satisfies AdministrativeEventDetailLoaderData;
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
): Promise<AdministrativeEventDetailActionData> {
  const result = await resultPromise;

  if (!result.ok) {
    return actionError(result.error);
  }

  return actionSuccess(notification);
}

function actionError(message: string): AdministrativeEventDetailActionData {
  return {
    status: "error",
    message,
    fieldErrors: {},
    values: null,
  };
}

function actionSuccess(
  notification: EventRouteNotification,
): AdministrativeEventDetailActionData {
  return {
    status: "success",
    message: routeNotificationToasts[notification].message,
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

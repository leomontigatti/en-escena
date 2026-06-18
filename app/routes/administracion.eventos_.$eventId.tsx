import { eq } from "drizzle-orm";
import { Check, Ellipsis, Trash, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, redirect, useActionData } from "react-router";
import { toast } from "sonner";

import { EventFormFields, useEventForm } from "@/components/admin/events/form";
import { AdminResourceLayout } from "@/components/admin/resource-layout";
import type { AdminRouteHandle } from "@/components/admin/shell";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { db } from "@/db";
import { events as eventsTable } from "@/db/schema";
import {
  eventFormValues,
  parseEventFormValues,
  readEventFormValues,
  type EventFormValues,
  type FieldErrors,
} from "@/lib/admin/events/form-values";
import {
  activateEvent,
  deactivateEvent,
  deleteEvent,
  setEventVisibility,
  updateEvent,
  type EventMutationResult,
} from "@/lib/events/management.server";
import { requireAdminPanelUser } from "@/lib/auth/internal-navigation.server";
import {
  routeNotificationToastIds,
  type RouteNotificationKey,
} from "@/lib/shared/route-notification-toasts";
import { useServerActionToast } from "@/lib/shared/toasts";
import type {
  EventRegistrationMissingCode,
  EventRegistrationReadiness,
} from "@/lib/events/registration-readiness";
import { getEventRegistrationReadiness } from "@/lib/events/registration-readiness.server";

import type { Route } from "./+types/administracion.eventos_.$eventId";

type EventRow = typeof eventsTable.$inferSelect;
type LoaderData = Awaited<ReturnType<typeof loader>>;

type ActionData = {
  status: "error";
  message: string;
  fieldErrors: FieldErrors;
  values: EventFormValues | null;
};

type AdministracionEventoDetalleRouteProps = {
  loaderData: LoaderData;
  actionData?: ActionData;
};

export const meta: Route.MetaFunction = () => [
  { title: "Editar evento | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [
    { label: "Eventos", to: "/administracion/eventos" },
    (match) => {
      const data = match.data as
        | AdministracionEventoDetalleRouteProps["loaderData"]
        | undefined;
      return data ? { label: data.event.name } : null;
    },
  ],
} satisfies AdminRouteHandle;

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAdminPanelUser(request);
  const event = await loadEvent(params.eventId);

  return {
    event,
    registrationReadiness: await getEventRegistrationReadiness(event.id),
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireAdminPanelUser(request);

  const eventId = params.eventId;

  if (!eventId) {
    throw new Response("No encontramos ese evento.", { status: 404 });
  }

  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  switch (intent) {
    case "update":
      return updateEventAction(eventId, formData);

    case "activate":
      return redirectOrError(
        eventId,
        activateEvent(eventId),
        "evento-activado",
      );

    case "deactivate":
      if (formData.get("confirmDeactivation") !== eventId) {
        return actionError("Confirmá la desactivación del evento.");
      }

      return redirectOrError(
        eventId,
        deactivateEvent(eventId),
        "evento-desactivado",
      );

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

export function AdministracionEventoDetalleRouteView({
  loaderData,
  actionData,
}: AdministracionEventoDetalleRouteProps) {
  useServerActionToast(actionData, {
    toastId: routeNotificationToastIds["event-form-error"],
  });

  useEffect(() => {
    if (!actionData) {
      return;
    }

    toast.dismiss(routeNotificationToastIds["evento-guardado"]);
  }, [actionData]);

  return (
    <AdminResourceLayout
      title="Editar evento"
      description="Editá fechas, visibilidad y estado operativo del evento."
      requireSelectedEvent={false}
      headerAction={<EventActions event={loaderData.event} />}
    >
      <EventRegistrationReadinessAlert
        readiness={loaderData.registrationReadiness}
      />
      <EditEventPanel event={loaderData.event} actionData={actionData} />
    </AdminResourceLayout>
  );
}

function EventRegistrationReadinessAlert({
  readiness,
}: {
  readiness: EventRegistrationReadiness;
}) {
  if (readiness.isReady) {
    return null;
  }

  return (
    <Alert>
      <TriangleAlert aria-hidden="true" />
      <AlertDescription>
        <p>Este evento no está listo para inscribir coreografías.</p>
        <ul className="mt-1 list-disc pl-5">
          {summarizeMissingItems(readiness.missingItems).map((item) => (
            <li key={item.code}>
              {item.message}{" "}
              <Link to={getMissingItemAdminPath(item.code)}>
                Revisar {item.linkLabel}
              </Link>
              .
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

function summarizeMissingItems(
  missingItems: EventRegistrationReadiness["missingItems"],
) {
  const missingCodes = Array.from(
    new Set(missingItems.map((item) => item.code)),
  );

  return missingCodes.map((code) => ({
    code,
    linkLabel: getMissingItemLinkLabel(code),
    message: getMissingItemSummary(code),
  }));
}

export default function AdministracionEventoDetalleRoute({
  loaderData,
}: AdministracionEventoDetalleRouteProps) {
  const actionData = useActionData<typeof action>();

  return (
    <AdministracionEventoDetalleRouteView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}

function getMissingItemAdminPath(code: EventRegistrationMissingCode) {
  switch (code) {
    case "modalities":
      return "/administracion/modalidades";
    case "categories":
      return "/administracion/categorias";
    case "schedule-blocks":
    case "schedule-entries":
    case "schedule-compatibility":
      return "/administracion/bloques-horarios";
    case "prices":
    case "price-coverage":
      return "/administracion/precios";
  }
}

function getMissingItemLinkLabel(code: EventRegistrationMissingCode) {
  switch (code) {
    case "modalities":
      return "modalidades";
    case "categories":
      return "categorías";
    case "schedule-blocks":
    case "schedule-entries":
    case "schedule-compatibility":
      return "bloques horarios";
    case "prices":
    case "price-coverage":
      return "precios";
  }
}

function getMissingItemSummary(code: EventRegistrationMissingCode) {
  switch (code) {
    case "modalities":
      return "Falta cargar modalidades.";
    case "categories":
      return "Falta cargar categorías.";
    case "schedule-blocks":
      return "Falta cargar bloques horarios.";
    case "schedule-entries":
      return "Falta cargar cronogramas.";
    case "prices":
      return "Falta cargar precios.";
    case "schedule-compatibility":
      return "Existen categorías sin un cronograma compatible.";
    case "price-coverage":
      return "Existen combinaciones sin un precio aplicable.";
  }
}

function EditEventPanel({
  event,
  actionData,
}: {
  event: EventRow;
  actionData?: ActionData;
}) {
  const defaultValues = actionData?.values ?? eventFormValues(event);
  const eventForm = useEventForm({
    values: defaultValues,
    fieldErrors: actionData?.fieldErrors,
  });

  return (
    <form
      method="post"
      action={eventActionPath(event.id)}
      noValidate
      onSubmit={eventForm.handleSubmit}
    >
      <Card>
        <CardContent>
          <input type="hidden" name="intent" value="update" />
          <EventFormFields controller={eventForm} />
        </CardContent>
        <CardFooter className="justify-end gap-3 border-0 bg-transparent pt-0">
          <Button asChild variant="outline" size="lg">
            <Link to="/administracion/eventos">Volver</Link>
          </Button>
          <Button type="submit" size="lg">
            <Check aria-hidden="true" data-icon="inline-start" />
            Guardar
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

function EventActions({ event }: { event: EventRow }) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon-lg"
            aria-label="Acciones"
          >
            <Ellipsis aria-hidden="true" />
            <span className="sr-only">Acciones</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuGroup>
            <EventActionItem
              action={eventActionPath(event.id)}
              intent={event.active ? "deactivate" : "activate"}
              confirmName={event.active ? "confirmDeactivation" : undefined}
              confirmValue={event.active ? event.id : undefined}
              label={event.active ? "Desactivar" : "Activar"}
            />
            <EventActionItem
              action={eventActionPath(event.id)}
              intent="set-program-visibility"
              value={event.programVisible ? "false" : "true"}
              label={
                event.programVisible ? "Ocultar programa" : "Mostrar programa"
              }
            />
            <EventActionItem
              action={eventActionPath(event.id)}
              intent="set-results-visibility"
              value={event.resultsVisible ? "false" : "true"}
              label={
                event.resultsVisible
                  ? "Ocultar resultados"
                  : "Mostrar resultados"
              }
            />
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => setDeleteDialogOpen(true)}
            >
              Eliminar
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteEventDialog
        event={event}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      />
    </>
  );
}

function DeleteEventDialog({
  event,
  open,
  onOpenChange,
}: {
  event: EventRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Eliminar evento</DialogTitle>
          <DialogDescription>
            Esta acción no se puede deshacer. Se va a eliminar {event.name}.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancelar
            </Button>
          </DialogClose>
          <form method="post" action={eventActionPath(event.id)}>
            <input type="hidden" name="intent" value="delete" />
            <input type="hidden" name="confirmDeletion" value={event.id} />
            <Button type="submit" variant="destructive">
              <Trash data-icon="inline-start" />
              Eliminar
            </Button>
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EventActionItem({
  action,
  confirmName,
  confirmValue,
  intent,
  label,
  value,
  variant,
}: {
  action: string;
  confirmName?: string;
  confirmValue?: string;
  intent: string;
  label: string;
  value?: string;
  variant?: "destructive";
}) {
  return (
    <form method="post" action={action}>
      <input type="hidden" name="intent" value={intent} />
      {value ? <input type="hidden" name="value" value={value} /> : null}
      {confirmName && confirmValue ? (
        <input type="hidden" name={confirmName} value={confirmValue} />
      ) : null}
      <DropdownMenuItem asChild variant={variant}>
        <button
          type="submit"
          className="w-full justify-start whitespace-nowrap"
        >
          {label}
        </button>
      </DropdownMenuItem>
    </form>
  );
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
    return {
      status: "error" as const,
      message: result.error,
      fieldErrors: result.fieldErrors ?? {},
      values,
    };
  }

  throw redirect(savedEventPath(eventId));
}

function updateVisibility(
  eventId: string,
  visibility: Parameters<typeof setEventVisibility>[1],
  notification: EventRouteNotification,
) {
  return redirectOrError(
    eventId,
    setEventVisibility(eventId, visibility),
    notification,
  );
}

function redirectAfterDeletion(
  result: Awaited<ReturnType<typeof deleteEvent>>,
) {
  if (!result.ok) {
    return actionError(result.error);
  }

  throw redirect("/administracion/eventos?notificacion=evento-eliminado");
}

async function redirectOrError(
  eventId: string,
  resultPromise: Promise<EventMutationResult>,
  notification: EventRouteNotification,
) {
  const result = await resultPromise;

  if (!result.ok) {
    return actionError(result.error);
  }

  throw redirect(eventNotificationPath(eventId, notification));
}

function actionError(message: string): ActionData {
  return {
    status: "error",
    message,
    fieldErrors: {},
    values: null,
  };
}

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

function savedEventPath(eventId: string) {
  return eventNotificationPath(eventId, "evento-guardado");
}

function eventNotificationPath(
  eventId: string,
  notification: EventRouteNotification,
) {
  return `/administracion/eventos/${eventId}?notificacion=${notification}`;
}

function eventActionPath(eventId: string) {
  return `/administracion/eventos/${eventId}`;
}

async function loadEvent(eventId: string | undefined) {
  if (!eventId) {
    throw new Response("No encontramos ese evento.", { status: 404 });
  }

  const event = await db.query.events.findFirst({
    where: eq(eventsTable.id, eventId),
  });

  if (!event) {
    throw new Response("No encontramos ese evento.", { status: 404 });
  }

  return event;
}

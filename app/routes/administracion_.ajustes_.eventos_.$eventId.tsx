import { eq } from "drizzle-orm";
import {
  ArrowLeft,
  CalendarClock,
  Eye,
  EyeOff,
  Power,
  PowerOff,
  Save,
  Trash2,
} from "lucide-react";
import { Link, redirect, useActionData } from "react-router";
import type { ReactNode } from "react";

import { EventFormFields } from "@/components/admin-event-form";
import { AdminShell } from "@/components/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { events as eventsTable } from "@/db/schema";
import {
  eventFormValues,
  parseEventFormValues,
  readEventFormValues,
  type EventFormValues,
  type FieldErrors,
} from "@/lib/admin-event-form-values";
import {
  loadAdminEventContext,
  type AdminEventContext,
} from "@/lib/admin-event-context.server";
import {
  activateEvent,
  deactivateEvent,
  deleteEvent,
  setEventVisibility,
  updateEvent,
  type EventMutationResult,
} from "@/lib/event-management.server";
import { requireAdminPanelUser } from "@/lib/internal-navigation.server";

import type { Route } from "./+types/administracion_.ajustes_.eventos_.$eventId";

type EventRow = typeof eventsTable.$inferSelect;

type ActionData = {
  status: "error";
  message: string;
  fieldErrors: FieldErrors;
  values: EventFormValues | null;
};

type AdministracionEventoDetalleRouteProps = {
  loaderData: {
    email: string;
    eventOptions: AdminEventContext["events"];
    event: EventRow;
    saved: boolean;
  };
  actionData?: ActionData;
};

export const meta = () => [
  { title: "Editar Evento | Panel de administración | En Escena" },
];

export async function loader({ request, params }: Route.LoaderArgs) {
  const user = await requireAdminPanelUser(request);
  const eventContext = await loadAdminEventContext(request);
  const event = await loadEvent(params.eventId);
  const saved = new URL(request.url).searchParams.get("guardado") === "1";

  return {
    email: user.email,
    eventOptions: eventContext.events,
    event,
    saved,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireAdminPanelUser(request);

  const eventId = params.eventId;

  if (!eventId) {
    throw new Response("No encontramos ese Evento.", { status: 404 });
  }

  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  switch (intent) {
    case "update":
      return updateEventAction(eventId, formData);

    case "activate":
      return redirectOrError(eventId, activateEvent(eventId));

    case "deactivate":
      if (formData.get("confirmDeactivation") !== eventId) {
        return actionError("Confirmá la desactivación del Evento.");
      }

      return redirectOrError(eventId, deactivateEvent(eventId));

    case "delete":
      if (formData.get("confirmDeletion") !== eventId) {
        return actionError("Confirmá el borrado del Evento.");
      }

      return redirectAfterDeletion(await deleteEvent(eventId));

    case "set-program-visibility":
      return updateVisibility(eventId, {
        programVisible: formData.get("value") === "true",
      });

    case "set-results-visibility":
      return updateVisibility(eventId, {
        resultsVisible: formData.get("value") === "true",
      });

    default:
      return actionError("No pudimos procesar esa acción.");
  }
}

export function AdministracionEventoDetalleRouteView({
  loaderData,
  actionData,
}: AdministracionEventoDetalleRouteProps) {
  return (
    <AdminShell
      email={loaderData.email}
      events={loaderData.eventOptions}
      selectedEventId={null}
      title="Editar Evento"
      showEventSelector={false}
    >
      <div className="flex flex-col gap-6">
        <Button asChild variant="outline" className="w-fit">
          <Link to="/administracion/ajustes/eventos">
            <ArrowLeft data-icon="inline-start" />
            Volver a Eventos
          </Link>
        </Button>

        <section className="flex flex-col gap-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-950">
                {loaderData.event.name}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Esta pantalla usa el Evento de la URL como contexto. El selector
                global queda oculto para evitar una segunda fuente de verdad.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusBadge
                tone={loaderData.event.active ? "success" : "neutral"}
              >
                {loaderData.event.active ? "Activo" : "Inactivo"}
              </StatusBadge>
              <StatusBadge tone="neutral">
                Seña {loaderData.event.requiredDepositPercentage}%
              </StatusBadge>
            </div>
          </div>

          {loaderData.saved ? (
            <p className="rounded-lg border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary">
              Evento guardado.
            </p>
          ) : null}
          {actionData ? (
            <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {actionData.message}
            </p>
          ) : null}
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
          <EditEventPanel event={loaderData.event} actionData={actionData} />
          <div className="flex flex-col gap-6">
            <LifecyclePanel event={loaderData.event} />
            <VisibilityPanel event={loaderData.event} />
            <DangerPanel event={loaderData.event} />
          </div>
        </div>
      </div>
    </AdminShell>
  );
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

function EditEventPanel({
  event,
  actionData,
}: {
  event: EventRow;
  actionData?: ActionData;
}) {
  const defaultValues = actionData?.values ?? eventFormValues(event);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
          <CalendarClock aria-hidden="true" />
        </span>
        <div>
          <h3 className="text-lg font-semibold text-slate-950">
            Datos del Evento
          </h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            El nombre puede corregirse siempre. Fechas y seña se guardan solo
            cuando no hay dependencias operativas.
          </p>
        </div>
      </div>

      <form method="post" className="mt-6">
        <input type="hidden" name="intent" value="update" />
        <EventFormFields
          values={defaultValues}
          fieldErrors={actionData?.fieldErrors}
        />
        <Button type="submit" className="mt-6 w-full">
          <Save data-icon="inline-start" />
          Guardar cambios
        </Button>
      </form>
    </section>
  );
}

function LifecyclePanel({ event }: { event: EventRow }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-950">Activación</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Solo puede haber un Evento activo global. Para activar otro, primero
        desactivá el actual.
      </p>

      {event.active ? (
        <form method="post" className="mt-4 flex flex-col gap-3">
          <input type="hidden" name="intent" value="deactivate" />
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="confirmDeactivation"
              value={event.id}
              required
              className="mt-1 size-4 rounded border-slate-300 text-teal-700 focus:ring-teal-100"
            />
            Confirmo que quiero desactivar este Evento.
          </label>
          <Button type="submit" variant="outline" className="w-full">
            <PowerOff data-icon="inline-start" />
            Desactivar Evento
          </Button>
        </form>
      ) : (
        <form method="post" className="mt-4">
          <input type="hidden" name="intent" value="activate" />
          <Button type="submit" className="w-full">
            <Power data-icon="inline-start" />
            Activar Evento
          </Button>
        </form>
      )}
    </section>
  );
}

function VisibilityPanel({ event }: { event: EventRow }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-950">Visibilidad</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Controles preparatorios hasta que existan los flujos de programa y
        resultados. Se pueden cambiar de forma independiente.
      </p>
      <div className="mt-4 flex flex-col gap-3">
        <VisibilityForm
          intent="set-program-visibility"
          visible={event.programVisible}
          visibleLabel="Programa visible"
          hiddenLabel="Programa oculto"
        />
        <VisibilityForm
          intent="set-results-visibility"
          visible={event.resultsVisible}
          visibleLabel="Resultados visibles"
          hiddenLabel="Resultados ocultos"
        />
      </div>
    </section>
  );
}

function VisibilityForm({
  intent,
  visible,
  visibleLabel,
  hiddenLabel,
}: {
  intent: string;
  visible: boolean;
  visibleLabel: string;
  hiddenLabel: string;
}) {
  return (
    <form method="post" className="flex items-center justify-between gap-3">
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="value" value={visible ? "false" : "true"} />
      <StatusBadge tone={visible ? "info" : "neutral"}>
        {visible ? visibleLabel : hiddenLabel}
      </StatusBadge>
      <Button type="submit" variant="outline">
        {visible ? (
          <EyeOff data-icon="inline-start" />
        ) : (
          <Eye data-icon="inline-start" />
        )}
        {visible ? "Ocultar" : "Mostrar"}
      </Button>
    </form>
  );
}

function DangerPanel({ event }: { event: EventRow }) {
  return (
    <section className="rounded-lg border border-red-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-950">Borrar Evento</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Solo se permite borrar Eventos inactivos y sin dependencias operativas.
      </p>
      <form method="post" className="mt-4 flex flex-col gap-3">
        <input type="hidden" name="intent" value="delete" />
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="confirmDeletion"
            value={event.id}
            required
            className="mt-1 size-4 rounded border-slate-300 text-red-700 focus:ring-red-100"
          />
          Confirmo que quiero borrar este Evento.
        </label>
        <Button type="submit" variant="destructive" className="w-full">
          <Trash2 data-icon="inline-start" />
          Borrar Evento
        </Button>
      </form>
    </section>
  );
}

function StatusBadge({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "info" | "neutral" | "success";
}) {
  const variant = tone === "success" ? "default" : "secondary";

  return <Badge variant={variant}>{children}</Badge>;
}

async function updateEventAction(eventId: string, formData: FormData) {
  const values = readEventFormValues(formData);
  const parsed = parseEventFormValues(values);

  if (!parsed.ok) {
    return {
      status: "error" as const,
      message: "Revisá los datos del Evento.",
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
) {
  return redirectOrError(eventId, setEventVisibility(eventId, visibility));
}

function redirectAfterDeletion(
  result: Awaited<ReturnType<typeof deleteEvent>>,
) {
  if (!result.ok) {
    return actionError(result.error);
  }

  throw redirect("/administracion/ajustes/eventos");
}

async function redirectOrError(
  eventId: string,
  resultPromise: Promise<EventMutationResult>,
) {
  const result = await resultPromise;

  if (!result.ok) {
    return actionError(result.error);
  }

  throw redirect(savedEventPath(eventId));
}

function actionError(message: string): ActionData {
  return {
    status: "error",
    message,
    fieldErrors: {},
    values: null,
  };
}

function savedEventPath(eventId: string) {
  return `/administracion/ajustes/eventos/${eventId}?guardado=1`;
}

async function loadEvent(eventId: string | undefined) {
  if (!eventId) {
    throw new Response("No encontramos ese Evento.", { status: 404 });
  }

  const event = await db.query.events.findFirst({
    where: eq(eventsTable.id, eventId),
  });

  if (!event) {
    throw new Response("No encontramos ese Evento.", { status: 404 });
  }

  return event;
}

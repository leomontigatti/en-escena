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
import { useState } from "react";
import { Link, redirect, useActionData } from "react-router";
import type { InputHTMLAttributes, ReactNode } from "react";

import { AdminShell } from "@/components/admin-shell";
import { db } from "@/db";
import { events as eventsTable } from "@/db/schema";
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
  type CreateEventInput,
  type EventMutationResult,
} from "@/lib/event-management.server";
import { requireAdminPanelUser } from "@/lib/internal-navigation.server";

import type { Route } from "./+types/administracion.eventos.$eventId";

type EventRow = typeof eventsTable.$inferSelect;

type FieldErrors = NonNullable<
  Extract<EventMutationResult, { ok: false }>["fieldErrors"]
>;

type EventFormValues = Record<keyof CreateEventInput, string>;

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

const DEFAULT_REQUIRED_DEPOSIT_PERCENTAGE = "30";
const MIN_REQUIRED_DEPOSIT_PERCENTAGE = 0;
const MAX_REQUIRED_DEPOSIT_PERCENTAGE = 100;

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
      <div className="space-y-6">
        <Link
          to="/administracion/eventos"
          className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Volver a Eventos
        </Link>

        <section className="space-y-2">
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
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              Evento guardado.
            </p>
          ) : null}
          {actionData ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {actionData.message}
            </p>
          ) : null}
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
          <EditEventPanel event={loaderData.event} actionData={actionData} />
          <div className="space-y-6">
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
  const [registrationStartsAt, setRegistrationStartsAt] = useState(
    defaultValues.registrationStartsAt,
  );
  const [startsAt, setStartsAt] = useState(defaultValues.startsAt);
  const showRegistrationStartWarning =
    registrationStartsAt !== "" &&
    startsAt !== "" &&
    registrationStartsAt > startsAt;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex size-9 items-center justify-center rounded-md bg-teal-50 text-teal-700">
          <CalendarClock aria-hidden="true" className="size-5" />
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

      <form method="post" className="mt-6 space-y-4">
        <input type="hidden" name="intent" value="update" />
        <Field
          label="Nombre"
          name="name"
          type="text"
          defaultValue={defaultValues.name}
          error={actionData?.fieldErrors.name}
          autoComplete="off"
        />
        <Field
          label="Inicio de inscripción"
          name="registrationStartsAt"
          type="datetime-local"
          defaultValue={defaultValues.registrationStartsAt}
          error={actionData?.fieldErrors.registrationStartsAt}
          onChange={(event) =>
            setRegistrationStartsAt(event.currentTarget.value)
          }
        />
        <Field
          label="Cierre de inscripción"
          name="registrationEndsAt"
          type="datetime-local"
          defaultValue={defaultValues.registrationEndsAt}
          error={actionData?.fieldErrors.registrationEndsAt}
        />
        <Field
          label="Inicio del Evento"
          name="startsAt"
          type="datetime-local"
          defaultValue={defaultValues.startsAt}
          error={actionData?.fieldErrors.startsAt}
          onChange={(event) => setStartsAt(event.currentTarget.value)}
        />
        <Field
          label="Cierre del Evento"
          name="endsAt"
          type="datetime-local"
          defaultValue={defaultValues.endsAt}
          error={actionData?.fieldErrors.endsAt}
        />
        <Field
          label="Seña requerida (%)"
          name="requiredDepositPercentage"
          type="number"
          min={MIN_REQUIRED_DEPOSIT_PERCENTAGE}
          max={MAX_REQUIRED_DEPOSIT_PERCENTAGE}
          step="1"
          defaultValue={defaultValues.requiredDepositPercentage}
          error={actionData?.fieldErrors.requiredDepositPercentage}
        />

        {showRegistrationStartWarning ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
            La inscripción empieza después del inicio del Evento. Podés guardar
            esta configuración si es intencional.
          </p>
        ) : null}

        <button
          type="submit"
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
        >
          <Save aria-hidden="true" className="size-4" />
          Guardar cambios
        </button>
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
        <form method="post" className="mt-4 space-y-3">
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
          <button
            type="submit"
            className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
          >
            <PowerOff aria-hidden="true" className="size-4" />
            Desactivar Evento
          </button>
        </form>
      ) : (
        <form method="post" className="mt-4">
          <input type="hidden" name="intent" value="activate" />
          <button
            type="submit"
            className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-teal-700 px-3 text-sm font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
          >
            <Power aria-hidden="true" className="size-4" />
            Activar Evento
          </button>
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
      <div className="mt-4 space-y-3">
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
      <button
        type="submit"
        className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
      >
        {visible ? (
          <EyeOff aria-hidden="true" className="size-4" />
        ) : (
          <Eye aria-hidden="true" className="size-4" />
        )}
        {visible ? "Ocultar" : "Mostrar"}
      </button>
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
      <form method="post" className="mt-4 space-y-3">
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
        <button
          type="submit"
          className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-red-700 px-3 text-sm font-semibold text-white transition hover:bg-red-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-100 disabled:cursor-not-allowed disabled:bg-red-300"
        >
          <Trash2 aria-hidden="true" className="size-4" />
          Borrar Evento
        </button>
      </form>
    </section>
  );
}

function Field({
  label,
  name,
  error,
  ...inputProps
}: {
  label: string;
  name: keyof EventFormValues;
  error?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "name">) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-800">{label}</span>
      <input
        name={name}
        required
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${name}-error` : undefined}
        className="mt-2 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-teal-700 focus:ring-4 focus:ring-teal-100 aria-[invalid=true]:border-red-500 aria-[invalid=true]:focus:border-red-600 aria-[invalid=true]:focus:ring-red-100"
        {...inputProps}
      />
      {error ? (
        <span id={`${name}-error`} className="mt-1 block text-xs text-red-700">
          {error}
        </span>
      ) : null}
    </label>
  );
}

function StatusBadge({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "info" | "neutral" | "success";
}) {
  const classes = {
    info: "border-sky-200 bg-sky-50 text-sky-900",
    neutral: "border-slate-200 bg-slate-50 text-slate-700",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  } satisfies Record<typeof tone, string>;

  return (
    <span
      className={`inline-flex rounded-md border px-2 py-1 text-xs font-medium ${classes[tone]}`}
    >
      {children}
    </span>
  );
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

  throw redirect("/administracion/eventos");
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
  return `/administracion/eventos/${eventId}?guardado=1`;
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

function readEventFormValues(formData: FormData): EventFormValues {
  return {
    name: String(formData.get("name") ?? ""),
    registrationStartsAt: String(formData.get("registrationStartsAt") ?? ""),
    registrationEndsAt: String(formData.get("registrationEndsAt") ?? ""),
    startsAt: String(formData.get("startsAt") ?? ""),
    endsAt: String(formData.get("endsAt") ?? ""),
    requiredDepositPercentage: String(
      formData.get("requiredDepositPercentage") ??
        DEFAULT_REQUIRED_DEPOSIT_PERCENTAGE,
    ),
  };
}

function parseEventFormValues(
  values: EventFormValues,
):
  | { ok: true; input: CreateEventInput }
  | { ok: false; fieldErrors: FieldErrors } {
  const fieldErrors: FieldErrors = {};
  const registrationStartsAt = parseArgentinaDateTime(
    values.registrationStartsAt,
  );
  const registrationEndsAt = parseArgentinaDateTime(values.registrationEndsAt);
  const startsAt = parseArgentinaDateTime(values.startsAt);
  const endsAt = parseArgentinaDateTime(values.endsAt);
  const requiredDepositPercentage = Number(values.requiredDepositPercentage);

  if (values.name.trim().length === 0) {
    fieldErrors.name = "Ingresá el nombre del Evento.";
  }

  if (!registrationStartsAt) {
    fieldErrors.registrationStartsAt = "Ingresá el inicio de inscripción.";
  }

  if (!registrationEndsAt) {
    fieldErrors.registrationEndsAt = "Ingresá el cierre de inscripción.";
  }

  if (!startsAt) {
    fieldErrors.startsAt = "Ingresá el inicio del Evento.";
  }

  if (!endsAt) {
    fieldErrors.endsAt = "Ingresá el cierre del Evento.";
  }

  if (
    values.requiredDepositPercentage.trim().length === 0 ||
    !Number.isInteger(requiredDepositPercentage) ||
    requiredDepositPercentage < MIN_REQUIRED_DEPOSIT_PERCENTAGE ||
    requiredDepositPercentage > MAX_REQUIRED_DEPOSIT_PERCENTAGE
  ) {
    fieldErrors.requiredDepositPercentage =
      "La seña requerida debe ser un entero entre 0 y 100.";
  }

  if (
    Object.keys(fieldErrors).length > 0 ||
    !registrationStartsAt ||
    !registrationEndsAt ||
    !startsAt ||
    !endsAt
  ) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    input: {
      name: values.name,
      registrationStartsAt,
      registrationEndsAt,
      startsAt,
      endsAt,
      requiredDepositPercentage,
    },
  };
}

function parseArgentinaDateTime(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    return null;
  }

  const date = new Date(`${value}:00-03:00`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function eventFormValues(event: EventRow): EventFormValues {
  return {
    name: event.name,
    registrationStartsAt: formatArgentinaDateTimeInput(
      event.registrationStartsAt,
    ),
    registrationEndsAt: formatArgentinaDateTimeInput(event.registrationEndsAt),
    startsAt: formatArgentinaDateTimeInput(event.startsAt),
    endsAt: formatArgentinaDateTimeInput(event.endsAt),
    requiredDepositPercentage: String(event.requiredDepositPercentage),
  };
}

function formatArgentinaDateTimeInput(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const valueByType = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );

  return `${valueByType.year}-${valueByType.month}-${valueByType.day}T${valueByType.hour}:${valueByType.minute}`;
}

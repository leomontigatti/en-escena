import { desc } from "drizzle-orm";
import { CalendarPlus } from "lucide-react";
import { useState } from "react";
import { redirect, useActionData } from "react-router";
import type { InputHTMLAttributes, ReactNode } from "react";

import { AdminShell } from "@/components/admin-shell";
import { db } from "@/db";
import { events as eventsTable } from "@/db/schema";
import {
  loadAdminEventContext,
  type AdminEventContext,
} from "@/lib/admin-event-context.server";
import {
  createEvent,
  type CreateEventInput,
  type EventMutationResult,
} from "@/lib/event-management.server";
import { requireAdminPanelUser } from "@/lib/internal-navigation.server";

import type { Route } from "./+types/administracion.eventos";

type EventRow = typeof eventsTable.$inferSelect;

type FieldErrors = NonNullable<
  Extract<EventMutationResult, { ok: false }>["fieldErrors"]
>;

type EventFormValues = Record<keyof CreateEventInput, string>;

type ActionData = {
  status: "error";
  message: string;
  fieldErrors: FieldErrors;
  values: EventFormValues;
};

type AdministracionEventosRouteProps = {
  loaderData: {
    email: string;
    eventOptions: AdminEventContext["events"];
    events: EventRow[];
    selectedEventId: string | null;
  };
  actionData?: ActionData;
};

const dateTimeFormatter = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Argentina/Buenos_Aires",
});
const DEFAULT_REQUIRED_DEPOSIT_PERCENTAGE = "30";
const MIN_REQUIRED_DEPOSIT_PERCENTAGE = 0;
const MAX_REQUIRED_DEPOSIT_PERCENTAGE = 100;

export const meta: Route.MetaFunction = () => [
  { title: "Eventos | Panel de administración | En Escena" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireAdminPanelUser(request);
  const eventContext = await loadAdminEventContext(request);
  const eventRows = await db.query.events.findMany({
    orderBy: [desc(eventsTable.startsAt)],
  });
  const selectedEventId = new URL(request.url).searchParams.get("evento");

  return {
    email: user.email,
    eventOptions: eventContext.events,
    events: eventRows,
    selectedEventId,
  };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdminPanelUser(request);

  const formData = await request.formData();
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

  const result = await createEvent(parsed.input);

  if (!result.ok) {
    return {
      status: "error" as const,
      message: result.error,
      fieldErrors: result.fieldErrors ?? {},
      values,
    };
  }

  throw redirect(`/administracion/eventos?evento=${result.event.id}`);
}

export function AdministracionEventosRouteView({
  loaderData,
  actionData: providedActionData,
}: AdministracionEventosRouteProps) {
  return (
    <AdminShell
      email={loaderData.email}
      events={loaderData.eventOptions}
      selectedEventId={null}
      title="Eventos"
      showEventSelector={false}
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
        <section className="min-w-0 space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">
              Eventos configurados
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Consultá el estado operativo, las fechas principales y las
              banderas de publicación de cada Evento.
            </p>
          </div>

          {loaderData.events.length > 0 ? (
            <EventTable
              events={loaderData.events}
              selectedEventId={loaderData.selectedEventId}
            />
          ) : (
            <EmptyEventState />
          )}
        </section>

        <CreateEventPanel actionData={providedActionData} />
      </div>
    </AdminShell>
  );
}

export default function AdministracionEventosRoute({
  loaderData,
}: AdministracionEventosRouteProps) {
  const actionData = useActionData<typeof action>();

  return (
    <AdministracionEventosRouteView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}

function EventTable({
  events,
  selectedEventId,
}: {
  events: EventRow[];
  selectedEventId: string | null;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-600">
          <tr>
            <th scope="col" className="px-4 py-3">
              Evento
            </th>
            <th scope="col" className="px-4 py-3">
              Estado
            </th>
            <th scope="col" className="px-4 py-3">
              Inscripción
            </th>
            <th scope="col" className="px-4 py-3">
              Evento
            </th>
            <th scope="col" className="px-4 py-3">
              Seña
            </th>
            <th scope="col" className="px-4 py-3">
              Visibilidad
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {events.map((event) => (
            <EventTableRow
              key={event.id}
              event={event}
              isSelected={event.id === selectedEventId}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EventTableRow({
  event,
  isSelected,
}: {
  event: EventRow;
  isSelected: boolean;
}) {
  const temporalState = getTemporalState(event);

  return (
    <tr id={event.id} className={isSelected ? "bg-teal-50" : "bg-white"}>
      <td className="px-4 py-3 align-top">
        <div className="font-medium text-slate-950">{event.name}</div>
        {isSelected ? (
          <div className="mt-1 text-xs font-medium text-teal-800">
            Evento creado
          </div>
        ) : null}
      </td>
      <td className="space-y-2 px-4 py-3 align-top">
        <StatusBadge tone={event.active ? "success" : "neutral"}>
          {event.active ? "Activo" : "Inactivo"}
        </StatusBadge>
        <StatusBadge tone={temporalState.tone}>
          {temporalState.label}
        </StatusBadge>
      </td>
      <td className="px-4 py-3 align-top text-slate-700">
        <DateRange
          startsAt={event.registrationStartsAt}
          endsAt={event.registrationEndsAt}
        />
      </td>
      <td className="px-4 py-3 align-top text-slate-700">
        <DateRange startsAt={event.startsAt} endsAt={event.endsAt} />
      </td>
      <td className="px-4 py-3 align-top font-medium text-slate-950">
        {event.requiredDepositPercentage}%
      </td>
      <td className="space-y-2 px-4 py-3 align-top">
        <StatusBadge tone={event.programVisible ? "info" : "neutral"}>
          {event.programVisible ? "Programa visible" : "Programa oculto"}
        </StatusBadge>
        <StatusBadge tone={event.resultsVisible ? "info" : "neutral"}>
          {event.resultsVisible ? "Resultados visibles" : "Resultados ocultos"}
        </StatusBadge>
      </td>
    </tr>
  );
}

function EmptyEventState() {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white px-5 py-8">
      <h3 className="text-base font-semibold text-slate-950">
        Todavía no hay Eventos creados.
      </h3>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
        Creá el primer Evento para definir fechas, seña requerida y preparar la
        operación sin activarlo todavía.
      </p>
    </div>
  );
}

function CreateEventPanel({ actionData }: { actionData?: ActionData }) {
  const defaultValues = actionData?.values ?? defaultEventFormValues();
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
          <CalendarPlus aria-hidden="true" className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Crear Evento</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            El nuevo Evento queda inactivo, con programa y resultados ocultos.
          </p>
        </div>
      </div>

      <form method="post" className="mt-6 space-y-4">
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

        {actionData ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
            {actionData.message}
          </p>
        ) : null}

        <button
          type="submit"
          className="inline-flex h-10 w-full items-center justify-center rounded-md bg-teal-700 px-4 text-sm font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
        >
          Crear Evento
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

function DateRange({ startsAt, endsAt }: { startsAt: Date; endsAt: Date }) {
  return (
    <span>
      {formatDateTime(startsAt)}
      <span className="block text-xs text-slate-500">
        hasta {formatDateTime(endsAt)}
      </span>
    </span>
  );
}

function StatusBadge({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "info" | "neutral" | "success" | "warning";
}) {
  const classes = {
    info: "border-sky-200 bg-sky-50 text-sky-900",
    neutral: "border-slate-200 bg-slate-50 text-slate-700",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
  } satisfies Record<typeof tone, string>;

  return (
    <span
      className={`inline-flex rounded-md border px-2 py-1 text-xs font-medium ${classes[tone]}`}
    >
      {children}
    </span>
  );
}

function getTemporalState(event: Pick<EventRow, "startsAt" | "endsAt">) {
  const now = new Date();

  if (now < event.startsAt) {
    return { label: "No iniciado", tone: "warning" as const };
  }

  if (now > event.endsAt) {
    return { label: "Finalizado", tone: "neutral" as const };
  }

  return { label: "En curso", tone: "success" as const };
}

function formatDateTime(date: Date) {
  return dateTimeFormatter.format(date);
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

function defaultEventFormValues(): EventFormValues {
  return {
    name: "",
    registrationStartsAt: "",
    registrationEndsAt: "",
    startsAt: "",
    endsAt: "",
    requiredDepositPercentage: DEFAULT_REQUIRED_DEPOSIT_PERCENTAGE,
  };
}

import { ArrowLeft, CalendarPlus } from "lucide-react";
import { Link, redirect, useActionData } from "react-router";

import { EventFormFields } from "@/components/admin-event-form";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import {
  defaultEventFormValues,
  parseEventFormValues,
  readEventFormValues,
  type EventFormValues,
  type FieldErrors,
} from "@/lib/admin-event-form-values";
import {
  loadAdminEventContext,
  type AdminEventContext,
} from "@/lib/admin-event-context.server";
import { createEvent } from "@/lib/event-management.server";
import { requireAdminPanelUser } from "@/lib/internal-navigation.server";

import type { Route } from "./+types/administracion_.ajustes_.eventos_.nuevo";

type ActionData = {
  status: "error";
  message: string;
  fieldErrors: FieldErrors;
  values: EventFormValues;
};

type AdministracionEventoNuevoRouteProps = {
  loaderData: {
    email: string;
    eventOptions: AdminEventContext["events"];
  };
  actionData?: ActionData;
};

export const meta: Route.MetaFunction = () => [
  { title: "Crear Evento | Panel de administración | En Escena" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireAdminPanelUser(request);
  const eventContext = await loadAdminEventContext(request);

  return {
    email: user.email,
    eventOptions: eventContext.events,
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

  throw redirect(
    `/administracion/ajustes/eventos/${result.event.id}?guardado=1`,
  );
}

export function AdministracionEventoNuevoRouteView({
  loaderData,
  actionData,
}: AdministracionEventoNuevoRouteProps) {
  const defaultValues = actionData?.values ?? defaultEventFormValues();

  return (
    <AdminShell
      email={loaderData.email}
      events={loaderData.eventOptions}
      selectedEventId={null}
      title="Crear Evento"
      showEventSelector={false}
    >
      <div className="flex flex-col gap-6">
        <Button asChild variant="outline" className="w-fit">
          <Link to="/administracion/ajustes/eventos">
            <ArrowLeft data-icon="inline-start" />
            Volver a Eventos
          </Link>
        </Button>

        <section className="max-w-2xl rounded-lg border bg-background p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
              <CalendarPlus aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-slate-950">
                Datos del Evento
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                El nuevo Evento queda inactivo, con programa y resultados
                ocultos.
              </p>
            </div>
          </div>

          {actionData ? (
            <p className="mt-5 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {actionData.message}
            </p>
          ) : null}

          <form method="post" className="mt-6">
            <EventFormFields
              values={defaultValues}
              fieldErrors={actionData?.fieldErrors}
            />
            <Button type="submit" className="mt-6 w-full">
              Crear Evento
            </Button>
          </form>
        </section>
      </div>
    </AdminShell>
  );
}

export default function AdministracionEventoNuevoRoute({
  loaderData,
}: AdministracionEventoNuevoRouteProps) {
  const actionData = useActionData<typeof action>();

  return (
    <AdministracionEventoNuevoRouteView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}

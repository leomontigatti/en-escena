import { Link, redirect, useActionData } from "react-router";
import { Save } from "lucide-react";

import { EventFormFields, useEventForm } from "@/components/admin/events/form";
import { AdminResourceLayout } from "@/components/admin/resource-layout";
import type { AdminRouteHandle } from "@/components/admin/shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  defaultEventFormValues,
  parseEventFormValues,
  readEventFormValues,
  type EventFormValues,
  type FieldErrors,
} from "@/lib/admin/events/form-values";
import {
  loadAdminEventContext,
  type AdminEventContext,
} from "@/lib/admin/event-context.server";
import { createEvent } from "@/lib/events/management.server";
import { requireAdminPanelUser } from "@/lib/auth/internal-navigation.server";
import { routeNotificationToastIds } from "@/lib/shared/route-notification-toasts";
import { useServerActionToast } from "@/lib/shared/toasts";

import type { Route } from "./+types/administracion.eventos_.nuevo";

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
    selectedEventId: AdminEventContext["selectedEventId"];
  };
  actionData?: ActionData;
};

export const meta: Route.MetaFunction = () => [
  { title: "Crear Evento | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [
    { label: "Eventos", to: "/administracion/eventos" },
    { label: "Nuevo" },
  ],
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireAdminPanelUser(request);
  const eventContext = await loadAdminEventContext(request);

  return {
    email: user.email,
    eventOptions: eventContext.events,
    selectedEventId: eventContext.selectedEventId,
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
    `/administracion/eventos/${result.event.id}?notificacion=evento-guardado`,
  );
}

export function AdministracionEventoNuevoRouteView({
  loaderData,
  actionData,
}: AdministracionEventoNuevoRouteProps) {
  const defaultValues = actionData?.values ?? defaultEventFormValues();
  const eventForm = useEventForm({
    values: defaultValues,
    fieldErrors: actionData?.fieldErrors,
  });

  useServerActionToast(actionData, {
    toastId: routeNotificationToastIds["event-form-error"],
  });

  return (
    <AdminResourceLayout
      loaderData={{
        selectedEventId: loaderData.selectedEventId,
      }}
      title="Nuevo evento"
      description="Definí fechas, seña requerida y visibilidad inicial del evento."
      requireSelectedEvent={false}
    >
      <form
        method="post"
        noValidate
        className="flex w-full flex-col gap-4"
        onSubmit={eventForm.handleSubmit}
      >
        <Card>
          <CardContent>
            <EventFormFields controller={eventForm} />
          </CardContent>
        </Card>
        <div className="flex items-center justify-between">
          <Button asChild variant="outline">
            <Link to="/administracion/eventos">Volver</Link>
          </Button>
          <Button type="submit">
            <Save data-icon="inline-start" />
            Guardar
          </Button>
        </div>
      </form>
    </AdminResourceLayout>
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

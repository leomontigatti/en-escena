import { Link, redirect, useActionData } from "react-router";
import { Check } from "lucide-react";

import { EventFormFields, useEventForm } from "@/components/admin/events/form";
import { AdminResourceLayout } from "@/components/admin/resource-layout";
import type { AdminRouteHandle } from "@/components/admin/shell";
import { ButtonPendingContent } from "@/components/shared/button-pending-content";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  defaultEventFormValues,
  parseEventFormValues,
  readEventFormValues,
  type EventFormValues,
  type FieldErrors,
} from "@/lib/admin/events/form-values";
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
  actionData,
}: AdministracionEventoNuevoRouteProps) {
  const defaultValues = actionData?.values ?? defaultEventFormValues();
  const eventForm = useEventForm({
    values: defaultValues,
    fieldErrors: actionData?.fieldErrors,
    pendingScope: { intent: "create" },
  });

  useServerActionToast(actionData, {
    toastId: routeNotificationToastIds["event-form-error"],
  });

  return (
    <AdminResourceLayout
      title="Nuevo evento"
      description="Definí fechas, seña requerida y visibilidad inicial del evento."
      requireSelectedEvent={false}
    >
      <form method="post" noValidate onSubmit={eventForm.handleSubmit}>
        <input type="hidden" name="intent" value="create" />
        <Card>
          <CardContent>
            <EventFormFields controller={eventForm} />
          </CardContent>
          <CardFooter className="justify-end gap-3 border-0 bg-transparent pt-0">
            <Button asChild variant="outline" size="lg">
              <Link to="/administracion/eventos">Volver</Link>
            </Button>
            <Button type="submit" size="lg" disabled={eventForm.isPending}>
              <ButtonPendingContent
                isPending={eventForm.isPending}
                pendingLabel="Guardando evento..."
                idleLabel="Guardar"
                idleIcon={<Check aria-hidden="true" data-icon="inline-start" />}
              />
            </Button>
          </CardFooter>
        </Card>
      </form>
    </AdminResourceLayout>
  );
}

export default function AdministracionEventoNuevoRoute() {
  const actionData = useActionData<typeof action>();

  return <AdministracionEventoNuevoRouteView actionData={actionData} />;
}

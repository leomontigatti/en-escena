import { Link } from "react-router";

import { EventFormFields, useEventForm } from "@/components/admin/events/form";
import { AdminResourceLayout } from "@/components/admin/resource-layout";
import { SubmitButton } from "@/components/shared/action-buttons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { defaultEventFormValues } from "@/lib/admin/events/form-values";
import { routeNotificationToastIds } from "@/lib/shared/route-notification-toasts";
import { useServerActionToast } from "@/lib/shared/toasts";

import type { AdministrativeEventCreateActionData } from "./shared";

export type AdministrativeEventCreateViewProps = {
  actionData?: AdministrativeEventCreateActionData;
};

export function AdministrativeEventCreateView({
  actionData,
}: AdministrativeEventCreateViewProps) {
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
            <SubmitButton size="lg" isPending={eventForm.isPending} />
          </CardFooter>
        </Card>
      </form>
    </AdminResourceLayout>
  );
}

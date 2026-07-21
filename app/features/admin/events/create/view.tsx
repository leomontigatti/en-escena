import { Link } from "react-router";

import { EventFormFields, useEventForm } from "@/components/admin/events/form";
import {
  AdminResourceFormCard,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { SubmitButton } from "@/components/shared/action-buttons";
import { Button } from "@/components/ui/button";
import { defaultEventFormValues } from "@/lib/admin/events/form-values";
import { notificationToastIds } from "@/lib/shared/notification-toasts";
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
    pendingScope: { intent: "create" },
  });

  useServerActionToast(actionData, {
    toastId: notificationToastIds["event-form-error"],
  });

  return (
    <AdminResourceLayout
      title="Nuevo evento"
      description="Definí fechas, seña requerida y visibilidad inicial del evento."
      requireSelectedEvent={false}
    >
      <form method="post" noValidate onSubmit={eventForm.handleSubmit}>
        <input type="hidden" name="intent" value="create" />
        <AdminResourceFormCard
          footer={
            <>
              <Button asChild variant="outline">
                <Link to="/administracion/eventos">Volver</Link>
              </Button>
              <SubmitButton isPending={eventForm.isPending} />
            </>
          }
        >
          <EventFormFields controller={eventForm} />
        </AdminResourceFormCard>
      </form>
    </AdminResourceLayout>
  );
}

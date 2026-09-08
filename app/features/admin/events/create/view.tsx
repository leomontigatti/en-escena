import { EventFormFields, useEventForm } from "@/components/admin/events/form";
import {
  AdminResourceFormCard,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { BackButton, SubmitButton } from "@/components/shared/action-buttons";
import { defaultEventFormValues } from "@/lib/admin/events/form-values";
import { notificationToastIds } from "@/lib/shared/notification-toasts";
import { useServerActionToast } from "@/lib/shared/toasts";

import type { EventCreateActionData } from "./shared";

export type EventCreateViewProps = {
  actionData?: EventCreateActionData;
};

export function EventCreateView({ actionData }: EventCreateViewProps) {
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
              <BackButton to="/administracion/eventos" />
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

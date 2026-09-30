import { EventFormFields, useEventForm } from "@/components/admin/events/form";
import {
  AdminResourceFormCard,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { FormActions } from "@/components/shared/form-actions";
import { defaultEventFormValues } from "@/lib/admin/events/form-values";
import { useSavedFormValues } from "@/lib/shared/forms";
import { notificationToastIds } from "@/lib/shared/notification-toasts";
import { useServerActionToast } from "@/lib/shared/toasts";

import type { EventCreateActionData } from "./shared";

export type EventCreateViewProps = {
  actionData?: EventCreateActionData;
};

export function EventCreateView({ actionData }: EventCreateViewProps) {
  const emptyValues = defaultEventFormValues();
  const eventForm = useEventForm({
    values: emptyValues,
    pendingScope: { intent: "create" },
  });

  // A refused save comes back with what was typed, on top of the empty form.
  useSavedFormValues(eventForm.form, emptyValues, actionData?.values);

  useServerActionToast(actionData, {
    toastId: notificationToastIds["event-form-error"],
  });

  return (
    <AdminResourceLayout
      title="Nuevo evento"
      description="Definí fechas, seña requerida y visibilidad inicial del evento."
      requireSelectedEvent={false}
    >
      <form
        method="post"
        noValidate
        className="flex flex-1 flex-col gap-6"
        onSubmit={eventForm.handleSubmit}
      >
        <input type="hidden" name="intent" value="create" />
        <AdminResourceFormCard
          footer={
            <FormActions
              backTo="/administracion/eventos"
              hasChanges={eventForm.form.formState.isDirty}
              isPending={eventForm.isPending}
              onDiscard={() => eventForm.form.reset()}
            />
          }
        >
          <EventFormFields controller={eventForm} />
        </AdminResourceFormCard>
      </form>
    </AdminResourceLayout>
  );
}

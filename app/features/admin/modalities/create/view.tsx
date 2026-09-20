import { AdminResourceLayout } from "@/components/admin/resource-layout";
import { useServerActionToast } from "@/lib/shared/toasts";

import {
  getNameSubmittedValues,
  ModalityForm,
  ModalityFormActions,
  useEventModalityForm,
  ModalityFormPanel,
} from "../form";
import type {
  EventModalitiesLoaderData,
  EventModalityActionData,
} from "../shared";

export type EventModalityCreateViewProps = {
  loaderData: EventModalitiesLoaderData;
  actionData?: EventModalityActionData;
};

export function EventModalityCreateView({
  loaderData,
  actionData,
}: EventModalityCreateViewProps) {
  useServerActionToast(actionData);

  const form = useEventModalityForm({
    submittedValues: getNameSubmittedValues(actionData, "create-modality"),
  });

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Nueva modalidad"
      description="Definí una modalidad para organizar las coreografías del evento activo."
    >
      <ModalityFormPanel>
        <ModalityForm
          form={form}
          formId="create-modality-form"
          intent="create-modality"
        />
        <ModalityFormActions
          form={form}
          formId="create-modality-form"
          pendingScope={{ intent: "create-modality" }}
        />
      </ModalityFormPanel>
    </AdminResourceLayout>
  );
}

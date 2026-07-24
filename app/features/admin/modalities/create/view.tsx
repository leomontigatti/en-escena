import { AdminResourceLayout } from "@/components/admin/resource-layout";
import { useServerActionToast } from "@/lib/shared/toasts";

import {
  getNameSubmittedValues,
  ModalityForm,
  ModalityFormActions,
  ModalityFormPanel,
} from "../form";
import type {
  AdministrativeEventModalitiesLoaderData,
  AdministrativeEventModalityActionData,
} from "../shared";

export type AdministrativeEventModalityCreateViewProps = {
  loaderData: AdministrativeEventModalitiesLoaderData;
  actionData?: AdministrativeEventModalityActionData;
};

export function AdministrativeEventModalityCreateView({
  loaderData,
  actionData,
}: AdministrativeEventModalityCreateViewProps) {
  useServerActionToast(actionData);

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Nueva modalidad"
      description="Definí una modalidad para organizar las coreografías del evento activo."
    >
      <ModalityFormPanel>
        <ModalityForm
          formId="create-modality-form"
          intent="create-modality"
          submodalities={[]}
          submittedValues={getNameSubmittedValues(
            actionData,
            "create-modality",
          )}
        />
        <ModalityFormActions
          formId="create-modality-form"
          pendingScope={{ intent: "create-modality" }}
        />
      </ModalityFormPanel>
    </AdminResourceLayout>
  );
}

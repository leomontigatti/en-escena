import { AdminResourceLayout } from "@/components/admin/resource-layout";
import { useServerActionToast } from "@/lib/shared/toasts";

import { SeminarForm, SeminarFormActions, SeminarFormPanel } from "../form";
import {
  createSeminarIntent,
  type SeminarActionData,
  type SeminarCreateLoaderData,
} from "../shared";

const createSeminarFormId = "create-seminar-form";

export type SeminarCreateViewProps = {
  actionData?: SeminarActionData;
  loaderData: SeminarCreateLoaderData;
};

export function SeminarCreateView({
  actionData,
  loaderData,
}: SeminarCreateViewProps) {
  useServerActionToast(actionData);

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Nuevo seminario"
      description="Definí el instructor, la fecha, la hora y el cupo del seminario."
      eventRequiredEmptyState={{
        title: "Elegí un evento activo para crear seminarios",
        description: "Activá un evento para ofrecer seminarios en él.",
      }}
    >
      <SeminarFormPanel>
        <SeminarForm
          actionData={actionData}
          formId={createSeminarFormId}
          intent={createSeminarIntent}
          values={loaderData.values}
        />
        <SeminarFormActions
          formId={createSeminarFormId}
          pendingScope={{ intent: createSeminarIntent }}
          selectedEventId={loaderData.selectedEventId}
        />
      </SeminarFormPanel>
    </AdminResourceLayout>
  );
}

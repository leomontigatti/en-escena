import { AdminResourceLayout } from "@/components/admin/resource-layout";
import { useServerActionToast } from "@/lib/shared/toasts";

import {
  SeminarForm,
  SeminarFormActions,
  SeminarFormPanel,
  useSeminarForm,
} from "../form";
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

  const controller = useSeminarForm({
    actionData,
    intent: createSeminarIntent,
    values: loaderData.values,
  });

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Nuevo seminario"
      description="Definí el instructor, el tipo, la fecha, la hora, el cupo y la seña del seminario."
      eventRequiredEmptyState={{
        title: "Elegí un evento activo para crear seminarios",
        description: "Activá un evento para ofrecer seminarios en él.",
      }}
    >
      <SeminarFormPanel>
        <SeminarForm
          controller={controller}
          formId={createSeminarFormId}
          intent={createSeminarIntent}
        />
        <SeminarFormActions
          controller={controller}
          formId={createSeminarFormId}
          pendingScope={{ intent: createSeminarIntent }}
          selectedEventId={loaderData.selectedEventId}
        />
      </SeminarFormPanel>
    </AdminResourceLayout>
  );
}

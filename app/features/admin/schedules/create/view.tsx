import { AdminResourceLayout } from "@/components/admin/resource-layout";
import { useServerActionToast } from "@/lib/shared/toasts";

import { ScheduleForm, ScheduleFormActions, ScheduleFormPanel } from "../form";
import type {
  AdministrativeEventScheduleActionData,
  AdministrativeEventScheduleFormLoaderData,
} from "../shared";
import { getScheduleSubmittedValues } from "../submitted-values";

const createScheduleFormId = "create-schedule-form";

export type AdministrativeEventScheduleCreateViewProps = {
  actionData?: AdministrativeEventScheduleActionData;
  loaderData: AdministrativeEventScheduleFormLoaderData;
};

export function AdministrativeEventScheduleCreateView({
  loaderData,
  actionData,
}: AdministrativeEventScheduleCreateViewProps) {
  useServerActionToast(actionData);

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Nuevo cronograma"
      description="Definí fecha, hora, cupo total y modalidades aceptadas para este cronograma."
    >
      <ScheduleFormPanel>
        <ScheduleForm
          formId={createScheduleFormId}
          intent="create-schedule"
          modalities={loaderData.modalities}
          submittedValues={getScheduleSubmittedValues(
            actionData,
            "create-schedule",
          )}
        />
        <ScheduleFormActions
          formId={createScheduleFormId}
          pendingScope={{ intent: "create-schedule" }}
        />
      </ScheduleFormPanel>
    </AdminResourceLayout>
  );
}

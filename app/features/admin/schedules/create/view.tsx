import { AdminResourceLayout } from "@/components/admin/resource-layout";
import { useServerActionToast } from "@/lib/shared/toasts";

import {
  ScheduleForm,
  ScheduleFormActions,
  ScheduleFormPanel,
  useScheduleForm,
} from "../form";
import type {
  EventScheduleActionData,
  EventScheduleFormLoaderData,
} from "../shared";
import { getScheduleSubmittedValues } from "../submitted-values";

const createScheduleFormId = "create-schedule-form";

export type EventScheduleCreateViewProps = {
  actionData?: EventScheduleActionData;
  loaderData: EventScheduleFormLoaderData;
};

export function EventScheduleCreateView({
  loaderData,
  actionData,
}: EventScheduleCreateViewProps) {
  useServerActionToast(actionData);

  const form = useScheduleForm({
    submittedValues: getScheduleSubmittedValues(actionData, "create-schedule"),
  });

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Nuevo cronograma"
      description="Definí fecha, hora, cupo total, y modalidades y categorías aceptadas para este cronograma."
    >
      <ScheduleFormPanel>
        <ScheduleForm
          categories={loaderData.categories}
          form={form}
          formId={createScheduleFormId}
          intent="create-schedule"
          modalities={loaderData.modalities}
        />
        <ScheduleFormActions
          form={form}
          formId={createScheduleFormId}
          pendingScope={{ intent: "create-schedule" }}
        />
      </ScheduleFormPanel>
    </AdminResourceLayout>
  );
}

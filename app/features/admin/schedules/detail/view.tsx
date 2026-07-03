import { AdminResourceLayout } from "@/components/admin/resource-layout";
import { useServerActionToast } from "@/lib/shared/toasts";

import { EmptyResourceState, ScheduleActions } from "../dialogs";
import { ScheduleForm, ScheduleFormActions, ScheduleFormPanel } from "../form";
import type {
  AdministrativeEventScheduleActionData,
  AdministrativeEventScheduleDetailLoaderData,
} from "../shared";
import { getScheduleSubmittedValues } from "../submitted-values";

export type AdministrativeEventScheduleDetailViewProps = {
  actionData?: AdministrativeEventScheduleActionData;
  loaderData: AdministrativeEventScheduleDetailLoaderData;
  scheduleId: string;
};

export function AdministrativeEventScheduleDetailView({
  loaderData,
  actionData,
  scheduleId,
}: AdministrativeEventScheduleDetailViewProps) {
  useServerActionToast(actionData);

  const schedule = loaderData.schedules.find(
    (candidate) => candidate.id === scheduleId,
  );
  const scheduleName = schedule?.name ?? "Cronograma";

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title={schedule ? "Editar cronograma" : scheduleName}
      description={
        schedule
          ? "Editá fecha, hora, cupo total y modalidades aceptadas."
          : "No encontramos ese cronograma para este Evento."
      }
      headerAction={schedule ? <ScheduleActions schedule={schedule} /> : null}
    >
      {schedule ? (
        <ScheduleFormPanel>
          <ScheduleForm
            formId="update-schedule-form"
            id={schedule.id}
            intent="update-schedule"
            modalities={loaderData.modalities}
            name={schedule.name}
            scheduledDate={schedule.scheduledDate}
            startTime={schedule.startTime}
            totalCapacity={schedule.totalCapacity}
            modalityIds={schedule.modalityIds}
            scheduleCapacities={schedule.scheduleCapacities}
            submittedValues={getScheduleSubmittedValues(
              actionData,
              "update-schedule",
              schedule.id,
            )}
          />
          <ScheduleFormActions
            formId="update-schedule-form"
            pendingScope={{
              intent: "update-schedule",
              fields: { id: schedule.id },
            }}
          />
        </ScheduleFormPanel>
      ) : (
        <EmptyResourceState>
          No encontramos ese cronograma para este Evento.
        </EmptyResourceState>
      )}
    </AdminResourceLayout>
  );
}

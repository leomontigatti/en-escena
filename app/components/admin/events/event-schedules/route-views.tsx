import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import type { ActionData } from "@/lib/admin/events/bases-action.server";
import { buildNewSchedulePath } from "@/lib/admin/events/event-bases-navigation";
import type { EventBasesLoaderData } from "@/lib/admin/events/event-bases.server";
import { useServerActionToast } from "@/lib/shared/toasts";

import { EmptyResourceState, ScheduleActions } from "./dialogs";
import { ScheduleForm, ScheduleFormActions, ScheduleFormPanel } from "./form";
import { ScheduleList } from "./list-table";
import {
  getScheduleFieldErrors,
  getScheduleSubmittedValues,
} from "./submitted-values";

type EventBaseAreaProps = {
  loaderData: EventBasesLoaderData;
  actionData?: ActionData;
};

const createScheduleFormId = "create-schedule-form";

export function EventSchedulesRouteView({
  loaderData,
}: {
  loaderData: EventBasesLoaderData;
}) {
  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Cronogramas"
      description="Consultá capacidad, modalidades aceptadas y ocupación reservada por cupos de cronograma."
      action={{
        label: "Nuevo cronograma",
        to: buildNewSchedulePath(loaderData.selectedEventId),
      }}
    >
      {loaderData.schedules.length > 0 ? (
        <ScheduleList
          schedules={loaderData.schedules}
          selectedEventId={loaderData.selectedEventId}
        />
      ) : (
        <AdminEmptyState
          title="Todavía no hay cronogramas creados."
          description="Creá el primer cronograma para definir cupo, hora y modalidades aceptadas del evento activo."
        />
      )}
    </AdminResourceLayout>
  );
}

export function NewEventScheduleRouteView({
  loaderData,
  actionData,
}: EventBaseAreaProps) {
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
          fieldErrors={getScheduleFieldErrors(actionData)}
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

export function EventScheduleDetailRouteView({
  actionData,
  loaderData,
  scheduleId,
}: EventBaseAreaProps & { scheduleId: string }) {
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
            fieldErrors={getScheduleFieldErrors(actionData, schedule.id)}
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

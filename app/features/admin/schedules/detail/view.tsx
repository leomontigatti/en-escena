import { TriangleAlert } from "lucide-react";

import { AdminResourceLayout } from "@/components/admin/resource-layout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useServerActionToast } from "@/lib/shared/toasts";

import { EmptyResourceState, ScheduleActions } from "../dialogs";
import {
  ScheduleForm,
  ScheduleFormActions,
  ScheduleFormPanel,
  useScheduleForm,
} from "../form";
import type {
  EventScheduleActionData,
  EventScheduleDetailLoaderData,
} from "../shared";
import { getScheduleSubmittedValues } from "../submitted-values";

export type EventScheduleDetailViewProps = {
  actionData?: EventScheduleActionData;
  loaderData: EventScheduleDetailLoaderData;
  scheduleId: string;
  initialDeleteDialogOpen?: boolean;
};

/**
 * Why `Abrir inscripciones` is unavailable, shown only while the action is
 * disabled. The reasons are the event's —what its `Bases del evento` are
 * missing, or that it already finished— because the readiness they come from
 * is per event and the switch is what makes it a rule.
 */
function ScheduleRegistrationOpenBlockersAlert({
  blockers,
}: {
  blockers: string[];
}) {
  if (blockers.length === 0) {
    return null;
  }

  return (
    <Alert variant="warning">
      <TriangleAlert
        aria-hidden="true"
        className="self-center !translate-y-0"
      />
      <AlertDescription className="[&_p:not(:last-child)]:mb-1">
        <p>No se pueden abrir las inscripciones de este cronograma.</p>
        <ul className="list-disc pl-5">
          {blockers.map((blocker) => (
            <li key={blocker}>{blocker}</li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

export function EventScheduleDetailView({
  loaderData,
  actionData,
  scheduleId,
  initialDeleteDialogOpen = false,
}: EventScheduleDetailViewProps) {
  useServerActionToast(actionData);

  const schedule = loaderData.schedules.find(
    (candidate) => candidate.id === scheduleId,
  );
  const scheduleName = schedule?.name ?? "Cronograma";
  const form = useScheduleForm({
    categoryIds: schedule?.categoryIds,
    modalityIds: schedule?.modalityIds,
    name: schedule?.name,
    scheduleCapacities: schedule?.scheduleCapacities,
    scheduledDate: schedule?.scheduledDate,
    startTime: schedule?.startTime,
    submittedValues: getScheduleSubmittedValues(
      actionData,
      "update-schedule",
      scheduleId,
    ),
    totalCapacity: schedule?.totalCapacity,
  });

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title={schedule ? "Editar cronograma" : scheduleName}
      description={
        schedule
          ? "Editá fecha, hora, cupo total, y modalidades y categorías aceptadas."
          : "No encontramos ese cronograma para este Evento."
      }
      headerAction={
        schedule ? (
          <ScheduleActions
            schedule={schedule}
            registrationOpenBlockers={loaderData.registrationOpenBlockers}
            initialDeleteDialogOpen={initialDeleteDialogOpen}
          />
        ) : null
      }
    >
      {schedule ? (
        <ScheduleFormPanel>
          {schedule.registrationOpen ? null : (
            <ScheduleRegistrationOpenBlockersAlert
              blockers={loaderData.registrationOpenBlockers}
            />
          )}
          <ScheduleForm
            categories={loaderData.categories}
            form={form}
            formId="update-schedule-form"
            id={schedule.id}
            intent="update-schedule"
            modalities={loaderData.modalities}
            occupiedCount={schedule.occupiedCount}
            scheduleCapacities={schedule.scheduleCapacities}
          />
          <ScheduleFormActions
            form={form}
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

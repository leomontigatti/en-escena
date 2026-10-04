import { Info, TriangleAlert } from "lucide-react";

import { AdminResourceLayout } from "@/components/admin/resource-layout";
import { AlertStack } from "@/components/shared/alert-stack";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  scheduleRegistrationOpenRefusalMessage,
  type ScheduleRegistrationOpenBlockers,
} from "@/lib/schedules/registration-open";
import { getScheduleDateTimeLockReasons } from "@/lib/schedules/schedule-dependencies";
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
  blockers: ScheduleRegistrationOpenBlockers;
}) {
  return (
    <Alert variant="warning">
      <TriangleAlert aria-hidden="true" />
      <AlertTitle>{scheduleRegistrationOpenRefusalMessage}</AlertTitle>
      <AlertDescription>
        <ul className="list-disc pl-5">
          {blockers.map((blocker) => (
            <li key={blocker}>{blocker}</li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

/**
 * Why date and time are locked, and what frees them. It speaks of the fields
 * only: `Eliminar` stays enabled and answers for itself.
 */
function ScheduleDateTimeLockAlert({ reasons }: { reasons: string[] }) {
  return (
    <Alert variant="info">
      <Info aria-hidden="true" />
      <AlertTitle>La fecha y la hora no se pueden cambiar</AlertTitle>
      <AlertDescription>
        <p>
          Se pueden cambiar cuando el cronograma no tenga coreografías asignadas
          ni precios que lo cubran.
        </p>
        <ul className="list-disc pl-5">
          {reasons.map((reason) => (
            <li key={reason}>{reason}</li>
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
    awardCeremonyDate: schedule?.awardCeremonyDate,
    awardCeremonyTime: schedule?.awardCeremonyTime,
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
  const dateTimeLockReasons = loaderData.scheduleDependencies
    ? getScheduleDateTimeLockReasons(loaderData.scheduleDependencies)
    : [];

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title={scheduleName}
      description={
        schedule
          ? "Editá fecha, hora, cupo total, y modalidades y categorías aceptadas."
          : "No encontramos ese cronograma para este Evento."
      }
      headerAction={
        schedule ? (
          <ScheduleActions
            dependencies={loaderData.scheduleDependencies}
            schedule={schedule}
            registrationOpenBlockers={loaderData.registrationOpenBlockers}
            initialDeleteDialogOpen={initialDeleteDialogOpen}
          />
        ) : null
      }
    >
      {schedule ? (
        <>
          <AlertStack>
            {!schedule.registrationOpen &&
            loaderData.registrationOpenBlockers.length > 0 ? (
              <ScheduleRegistrationOpenBlockersAlert
                blockers={loaderData.registrationOpenBlockers}
              />
            ) : null}
            {dateTimeLockReasons.length > 0 ? (
              <ScheduleDateTimeLockAlert reasons={dateTimeLockReasons} />
            ) : null}
          </AlertStack>
          <ScheduleFormPanel
            footer={
              <ScheduleFormActions
                form={form}
                formId="update-schedule-form"
                pendingScope={{
                  intent: "update-schedule",
                  fields: { id: schedule.id },
                }}
              />
            }
          >
            <ScheduleForm
              categories={loaderData.categories}
              form={form}
              formId="update-schedule-form"
              id={schedule.id}
              intent="update-schedule"
              isDateTimeLocked={dateTimeLockReasons.length > 0}
              modalities={loaderData.modalities}
              occupiedCount={schedule.occupiedCount}
              scheduleCapacities={schedule.scheduleCapacities}
            />
          </ScheduleFormPanel>
        </>
      ) : (
        <EmptyResourceState>
          No encontramos ese cronograma para este Evento.
        </EmptyResourceState>
      )}
    </AdminResourceLayout>
  );
}

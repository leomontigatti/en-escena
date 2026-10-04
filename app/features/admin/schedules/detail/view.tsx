import { Info } from "lucide-react";

import { AdminResourceLayout } from "@/components/admin/resource-layout";
import { AlertStack } from "@/components/shared/alert-stack";
import { ReasonList } from "@/components/shared/reason-list";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
        <ReasonList reasons={reasons} />
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
              lockedDateTime={
                dateTimeLockReasons.length > 0
                  ? {
                      scheduledDate: schedule.scheduledDate,
                      startTime: schedule.startTime,
                    }
                  : undefined
              }
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

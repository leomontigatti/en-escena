import { useState, type ReactNode } from "react";
import { Form } from "react-router";

import { DeleteDialog } from "@/components/shared/delete-dialog";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import type { ScheduleListItem } from "@/lib/events/bases.server";
import type { ScheduleRegistrationOpenBlockers } from "@/lib/schedules/registration-open";
import {
  getScheduleDeleteBlockReasons,
  type ScheduleDependencySummary,
} from "@/lib/schedules/schedule-dependencies";
import { isRouteFormPending, useOptionalNavigation } from "@/lib/shared/forms";

export function ScheduleActions({
  dependencies,
  schedule,
  registrationOpenBlockers,
  initialDeleteDialogOpen = false,
}: {
  dependencies: ScheduleDependencySummary | null;
  schedule: ScheduleListItem;
  registrationOpenBlockers: ScheduleRegistrationOpenBlockers;
  initialDeleteDialogOpen?: boolean;
}) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(
    initialDeleteDialogOpen,
  );
  // `Eliminar` stays enabled whatever holds the schedule: the click answers
  // with the reasons instead of the confirmation (style guide, Detail pages).
  const deleteBlockReasons = dependencies
    ? getScheduleDeleteBlockReasons(dependencies)
    : [];

  return (
    <>
      <ResourceActionsMenu contentClassName="w-56">
        <DropdownMenuGroup>
          {schedule.registrationOpen ? (
            <ScheduleRegistrationActionItem
              intent="close-schedule-registration"
              label="Cerrar inscripciones"
              scheduleId={schedule.id}
            />
          ) : (
            <ScheduleRegistrationActionItem
              disabled={registrationOpenBlockers.length > 0}
              intent="open-schedule-registration"
              label="Abrir inscripciones"
              scheduleId={schedule.id}
            />
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setDeleteDialogOpen(true)}
          >
            Eliminar
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </ResourceActionsMenu>
      <DeleteDialog
        title="¿Eliminar el cronograma?"
        blockedTitle="No se puede eliminar el cronograma"
        description={
          deleteBlockReasons.length > 0
            ? "Para eliminarlo, no tiene que tener coreografías asignadas, tampoco retiradas, ni precios que lo cubran."
            : `Esta acción borra ${schedule.name}. No se puede deshacer.`
        }
        isBlocked={deleteBlockReasons.length > 0}
        blockedDescription={
          <ul className="list-disc pl-5">
            {deleteBlockReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        }
        intentValue="delete-schedule"
        recordId={schedule.id}
        confirmFieldName="confirmDelete"
        confirmFieldValue="yes"
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      />
    </>
  );
}

/**
 * One menu item, one submission: the switch is a `POST` of its own so the
 * schedule form beside it neither carries it nor is dirtied by it. The item is
 * disabled with exactly the reasons the server would refuse it for, and the
 * detail's alert is what names them — the toast this returns says one line.
 */
function ScheduleRegistrationActionItem({
  disabled = false,
  intent,
  label,
  scheduleId,
}: {
  disabled?: boolean;
  intent: "open-schedule-registration" | "close-schedule-registration";
  label: string;
  scheduleId: string;
}) {
  const navigation = useOptionalNavigation();
  const isPending = isRouteFormPending(navigation, {
    intent,
    fields: { id: scheduleId },
  });

  return (
    <Form method="post">
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="id" value={scheduleId} />
      <DropdownMenuItem asChild disabled={disabled}>
        <button
          type="submit"
          disabled={disabled || isPending}
          className="w-full justify-start whitespace-nowrap"
        >
          <span className="inline-flex items-center gap-2">
            {isPending ? (
              <Spinner aria-hidden="true" data-icon="inline-start" />
            ) : null}
            {label}
          </span>
        </button>
      </DropdownMenuItem>
    </Form>
  );
}

export function EmptyResourceState({ children }: { children: ReactNode }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>Sin datos</EmptyTitle>
        <EmptyDescription>{children}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

export function ResourceBadge({
  children,
  title,
}: {
  children: ReactNode;
  /** The whole of what the badge stands for, when it stands for more than it shows. */
  title?: string;
}) {
  return (
    <Badge title={title} variant="secondary">
      {children}
    </Badge>
  );
}

import { useState, type ReactNode } from "react";

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
import { isRouteFormPending, useOptionalNavigation } from "@/lib/shared/forms";

export function ScheduleActions({
  schedule,
  registrationOpenBlockers,
  initialDeleteDialogOpen = false,
}: {
  schedule: ScheduleListItem;
  registrationOpenBlockers: ScheduleRegistrationOpenBlockers;
  initialDeleteDialogOpen?: boolean;
}) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(
    initialDeleteDialogOpen,
  );

  return (
    <>
      <ResourceActionsMenu contentClassName="w-56" size="icon">
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
        title="Eliminar cronograma"
        description={`Esta acción borra ${schedule.name} si no tiene cupos de cronograma ni otras dependencias asociadas. No se puede deshacer.`}
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
    <form method="post">
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="id" value={scheduleId} />
      <DropdownMenuItem asChild disabled={disabled}>
        <button
          type="submit"
          disabled={disabled || isPending}
          className="w-full justify-start whitespace-nowrap"
        >
          <span className="inline-flex items-center gap-2">
            {isPending ? <Spinner aria-hidden="true" data-icon /> : null}
            {label}
          </span>
        </button>
      </DropdownMenuItem>
    </form>
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

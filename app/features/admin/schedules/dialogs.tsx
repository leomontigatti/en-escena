import { useState, type ReactNode } from "react";

import { DeleteDialog } from "@/components/shared/delete-dialog";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import type { ScheduleListItem } from "@/lib/events/bases.server";

export function ScheduleActions({
  schedule,
  initialDeleteDialogOpen = false,
}: {
  schedule: ScheduleListItem;
  initialDeleteDialogOpen?: boolean;
}) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(
    initialDeleteDialogOpen,
  );

  return (
    <>
      <ResourceActionsMenu contentClassName="w-48" size="icon">
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
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Badge className={className} variant="secondary">
      {children}
    </Badge>
  );
}

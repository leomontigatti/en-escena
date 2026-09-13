import { useState } from "react";

import { DeleteDialog } from "@/components/shared/delete-dialog";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { seminarHasInscriptionsMessage } from "@/lib/seminars/registration-refusals";
import type { SeminarListItem } from "@/lib/seminars/repository.server";

import { deleteSeminarIntent } from "./shared";

export function SeminarActions({
  seminar,
  initialDeleteDialogOpen = false,
}: {
  seminar: SeminarListItem;
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
        title="Eliminar seminario"
        description={`Esta acción borra el seminario de ${seminar.instructorName}. No se puede deshacer.`}
        // The inscriptions are what the seminar owes: while any of them stands,
        // the dialog only explains itself and offers no destructive button.
        // Administration removes them from `Inscriptos` first.
        isBlocked={seminar.registeredCount > 0}
        blockedDescription={seminarHasInscriptionsMessage}
        intentValue={deleteSeminarIntent}
        recordId={seminar.id}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      />
    </>
  );
}

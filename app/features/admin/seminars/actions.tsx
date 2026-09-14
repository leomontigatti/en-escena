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
  // The inscriptions are what the seminar owes, and the alert above the tabs
  // already says it cannot be deleted while any stands, so the item is disabled
  // on sight. The count is the withdrawn-inclusive one, because that is what
  // `deleteSeminar` refuses on.
  const hasInscriptions = seminar.inscriptionCount > 0;

  return (
    <>
      <ResourceActionsMenu contentClassName="w-48" size="icon">
        <DropdownMenuGroup>
          <DropdownMenuItem
            variant="destructive"
            disabled={hasInscriptions}
            onSelect={() => setDeleteDialogOpen(true)}
          >
            Eliminar
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </ResourceActionsMenu>
      <DeleteDialog
        title="Eliminar seminario"
        description={`Esta acción borra el seminario de ${seminar.instructorName}. No se puede deshacer.`}
        // Still blocked when opened straight from the URL: the dialog then only
        // explains itself and offers no destructive button.
        isBlocked={hasInscriptions}
        blockedDescription={seminarHasInscriptionsMessage}
        intentValue={deleteSeminarIntent}
        recordId={seminar.id}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      />
    </>
  );
}

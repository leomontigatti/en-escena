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
  hasCoveredInscription,
  seminar,
  initialDeleteDialogOpen = false,
}: {
  hasCoveredInscription: boolean;
  seminar: SeminarListItem;
  initialDeleteDialogOpen?: boolean;
}) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(
    initialDeleteDialogOpen,
  );
  // The count is the withdrawn-inclusive one, because that is what
  // `deleteSeminar` refuses on.
  const hasInscriptions = seminar.inscriptionCount > 0;

  return (
    <>
      <ResourceActionsMenu contentClassName="w-48" size="icon">
        <DropdownMenuGroup>
          {/* A covered inscription locks fields, and the alert explaining
              them above the tabs names the delete too, so the item is
              disabled on sight. Uncovered ones are what nearly every seminar
              in use holds: the item stays enabled and the dialog says why it
              cannot delete (style guide, Detail pages). */}
          <DropdownMenuItem
            variant="destructive"
            disabled={hasCoveredInscription}
            onSelect={() => setDeleteDialogOpen(true)}
          >
            Eliminar
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </ResourceActionsMenu>
      <DeleteDialog
        title="¿Eliminar el seminario?"
        blockedTitle="No se puede eliminar el seminario"
        description={
          hasInscriptions
            ? describeDeletionWayOut(seminar)
            : `Esta acción borra el seminario de ${seminar.instructorName}. No se puede deshacer.`
        }
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

/**
 * What it takes to delete a seminar that holds inscriptions. Removing one with
 * money or a comprobante withdraws it instead of deleting it, and a withdrawn
 * row blocks the delete for good, so once only those are left there is no way
 * out to name.
 */
function describeDeletionWayOut(
  seminar: Pick<SeminarListItem, "registeredCount">,
) {
  return seminar.registeredCount > 0
    ? "Para eliminarlo, primero quitá el dinero de sus inscripciones y después quitalas desde Inscriptos. Una inscripción que se quita con dinero o comprobantes queda retirada, y entonces el seminario ya no se puede eliminar."
    : "Sus inscripciones retiradas conservan dinero o comprobantes, así que el seminario ya no se puede eliminar.";
}

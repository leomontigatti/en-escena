import { useState } from "react";

import { DeleteDialog } from "@/components/shared/delete-dialog";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
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
  // The count is the withdrawn-inclusive one, because that is what
  // `deleteSeminar` refuses on.
  const hasInscriptions = seminar.inscriptionCount > 0;
  const blockedDeletion = describeBlockedDeletion(seminar);

  return (
    <>
      <ResourceActionsMenu contentClassName="w-48">
        <DropdownMenuGroup>
          {/* Any inscription blocks the delete, covered or not: the item
              stays enabled and the dialog says why it cannot delete (style
              guide, Detail pages). */}
          <DropdownMenuItem
            variant="destructive"
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
            ? blockedDeletion.wayOut
            : `Esta acción borra el seminario de ${seminar.instructorName}. No se puede deshacer.`
        }
        isBlocked={hasInscriptions}
        blockedDescription={blockedDeletion.reason}
        intentValue={deleteSeminarIntent}
        recordId={seminar.id}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      />
    </>
  );
}

/**
 * Why a seminar that holds inscriptions cannot be deleted, for the alert, and
 * what it takes to delete it, for the description. Removing an inscription with
 * money or a comprobante withdraws it instead of deleting it, and a withdrawn
 * row blocks the delete for good, so once only those are left there is no way
 * out to name.
 */
function describeBlockedDeletion(
  seminar: Pick<SeminarListItem, "registeredCount">,
) {
  const reason =
    "Este seminario tiene inscripciones y no puede eliminarse directamente.";

  return seminar.registeredCount > 0
    ? {
        reason,
        wayOut:
          "Importante: seguir el orden para eliminarlo correctamente. Quitar el dinero de todas las inscripciones y después eliminarlas desde la lista de inscriptos.",
      }
    : {
        reason,
        wayOut:
          "Esas inscripciones no se pueden borrar, así que el seminario ya no se va a poder eliminar.",
      };
}

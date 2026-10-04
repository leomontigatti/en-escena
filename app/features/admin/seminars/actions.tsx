import { useState } from "react";

import { DeleteDialog } from "@/components/shared/delete-dialog";
import { ReasonList } from "@/components/shared/reason-list";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import type { SeminarListItem } from "@/lib/seminars/repository.server";

import { deleteSeminarIntent } from "./shared";

export function SeminarActions({
  hasComprobantes,
  seminar,
  initialDeleteDialogOpen = false,
}: {
  /** A comprobante blocks the delete for good, ahead of any inscription. */
  hasComprobantes: boolean;
  seminar: SeminarListItem;
  initialDeleteDialogOpen?: boolean;
}) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(
    initialDeleteDialogOpen,
  );
  const blockedDeletion = describeBlockedDeletion({
    hasComprobantes,
    seminar,
  });

  return (
    <>
      <ResourceActionsMenu contentClassName="w-48">
        <DropdownMenuGroup>
          {/* Any inscription or comprobante blocks the delete: the item
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
          blockedDeletion
            ? blockedDeletion.wayOut
            : `Esta acción borra el seminario de ${seminar.instructorName}. No se puede deshacer.`
        }
        isBlocked={blockedDeletion !== null}
        blockedDescription={
          blockedDeletion ? (
            <ReasonList reasons={blockedDeletion.reasons} />
          ) : null
        }
        intentValue={deleteSeminarIntent}
        recordId={seminar.id}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      />
    </>
  );
}

/**
 * Why a seminar cannot be deleted, for the alert, and what it takes, for the
 * description, or `null` when it can. They mirror `deleteSeminar`'s refusals:
 * a comprobante first, for good, then any inscription, withdrawn included.
 * Removing an inscription with money or a comprobante withdraws it instead of
 * deleting it, and a withdrawn row blocks the delete for good, so once only
 * those are left there is no way out to name.
 */
function describeBlockedDeletion({
  hasComprobantes,
  seminar,
}: {
  hasComprobantes: boolean;
  seminar: Pick<SeminarListItem, "inscriptionCount" | "registeredCount">;
}) {
  const hasInscriptions = seminar.inscriptionCount > 0;
  const reasons = [
    ...(hasComprobantes ? ["Tiene comprobantes emitidos."] : []),
    ...(hasInscriptions
      ? [
          "Este seminario tiene inscripciones y no puede eliminarse directamente.",
        ]
      : []),
  ];

  if (reasons.length === 0) {
    return null;
  }

  if (hasComprobantes) {
    return {
      reasons,
      wayOut: "Un seminario con comprobantes emitidos no se puede eliminar.",
    };
  }

  // A withdrawn row (an inscription that is not registered) blocks the delete
  // for good, so any of them leaves no order of steps that ends in a delete.
  const hasWithdrawnInscriptions =
    seminar.inscriptionCount > seminar.registeredCount;

  return {
    reasons,
    wayOut:
      seminar.registeredCount > 0 && !hasWithdrawnInscriptions
        ? "Importante: seguir el orden para eliminarlo correctamente. Quitar el dinero de todas las inscripciones y después eliminarlas desde la lista de inscriptos."
        : "Esas inscripciones no se pueden borrar, así que el seminario ya no se va a poder eliminar.",
  };
}

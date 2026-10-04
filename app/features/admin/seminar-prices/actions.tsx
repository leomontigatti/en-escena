import { useState } from "react";

import { DeleteDialog } from "@/components/shared/delete-dialog";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { readPriceDeletionBlock } from "@/lib/prices/guards";
import type { SeminarPriceListItem } from "@/lib/seminar-prices/repository.server";

export function SeminarPriceActions({
  seminarPrice,
  initialDeleteDialogOpen = false,
}: {
  seminarPrice: SeminarPriceListItem;
  initialDeleteDialogOpen?: boolean;
}) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(
    initialDeleteDialogOpen,
  );
  // The guard is read before the menu opens, so a protected row answers
  // `Eliminar` with the blocked acknowledgment instead of a refusal after the
  // submission (style guide, Detail pages). The server refuses all the same,
  // for the race.
  const deletionBlock = readPriceDeletionBlock(seminarPrice);

  return (
    <>
      <ResourceActionsMenu contentClassName="w-48">
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
        title="¿Eliminar el precio de seminario?"
        description={
          deletionBlock
            ? deletionBlock.wayOut
            : `Esta acción elimina ${seminarPrice.name}. No se puede deshacer.`
        }
        blockedTitle="No se puede eliminar el precio de seminario"
        isBlocked={deletionBlock !== null}
        blockedDescription={deletionBlock?.reason}
        intentValue="delete-seminar-price"
        recordId={seminarPrice.id}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      />
    </>
  );
}

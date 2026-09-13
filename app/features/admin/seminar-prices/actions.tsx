import { useState } from "react";

import { DeleteDialog } from "@/components/shared/delete-dialog";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import type { SeminarPriceListItem } from "@/lib/seminar-prices/repository.server";

import { readSeminarPriceDeletionBlock } from "./view-shared";

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
  // The guard is read before the menu opens, so a protected row shows a
  // disabled item and a dialog that explains instead of a refusal after the
  // submission. The server refuses all the same, for the race.
  const deletionBlock = readSeminarPriceDeletionBlock(seminarPrice);

  return (
    <>
      <ResourceActionsMenu
        contentClassName="w-48"
        contentProps={{ forceMount: true }}
        size="icon"
      >
        <DropdownMenuGroup>
          <DropdownMenuItem
            variant="destructive"
            disabled={Boolean(deletionBlock)}
            onSelect={() => setDeleteDialogOpen(true)}
          >
            Borrar precio
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </ResourceActionsMenu>
      <DeleteDialog
        title="Eliminar precio de seminario"
        description={`Esta acción borra ${seminarPrice.name} si no tiene dependencias asociadas.`}
        blockedDescription={deletionBlock}
        isBlocked={Boolean(deletionBlock)}
        intentValue="delete-seminar-price"
        recordId={seminarPrice.id}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      />
    </>
  );
}

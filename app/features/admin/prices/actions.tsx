import { useState, type ReactNode } from "react";

import { DeleteDialog } from "@/components/shared/delete-dialog";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
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
import type { PriceListItem } from "@/lib/events/bases.server";

import { getPriceDisplayName, readPriceDeletionBlock } from "./view-shared";

export function PriceActions({
  price,
  initialDeleteDialogOpen = false,
}: {
  price: PriceListItem;
  initialDeleteDialogOpen?: boolean;
}) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(
    initialDeleteDialogOpen,
  );
  // The guard is read before the menu opens, so a protected row shows a
  // disabled item and a dialog that explains instead of a refusal after the
  // submission. The server refuses all the same, for the race.
  const deletionBlock = readPriceDeletionBlock(price);

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
        title="Eliminar precio"
        description={`Esta acción borra ${getPriceDisplayName(price)} si no tiene dependencias asociadas. No se puede deshacer.`}
        blockedDescription={deletionBlock}
        isBlocked={Boolean(deletionBlock)}
        intentValue="delete-price"
        recordId={price.id}
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

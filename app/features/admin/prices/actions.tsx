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
import { readPriceDeletionBlock } from "@/lib/prices/guards";

import { getPriceDisplayName } from "./view-shared";

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
  // The guard is read before the menu opens, so a protected row answers
  // `Eliminar` with the blocked acknowledgment instead of a refusal after the
  // submission (style guide, Detail pages). The server refuses all the same,
  // for the race.
  const deletionBlock = readPriceDeletionBlock(price);

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
        title="¿Eliminar el precio?"
        description={
          deletionBlock
            ? deletionBlock.wayOut
            : `Esta acción elimina ${getPriceDisplayName(price)}. No se puede deshacer.`
        }
        blockedTitle="No se puede eliminar el precio"
        isBlocked={deletionBlock !== null}
        blockedDescription={deletionBlock?.reason}
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

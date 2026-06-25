import { useState, type ReactNode } from "react";

import { DestroyButton } from "@/components/shared/action-buttons";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

import { getPriceDisplayName } from "./shared";

export function PriceActions({ price }: { price: PriceListItem }) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

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
            onSelect={() => setDeleteDialogOpen(true)}
          >
            Borrar precio
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </ResourceActionsMenu>
      <DeletePriceDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        price={price}
      />
    </>
  );
}

function DeletePriceDialog({
  open,
  onOpenChange,
  price,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  price: PriceListItem;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Eliminar precio</DialogTitle>
          <DialogDescription>
            Esta acción borra {getPriceDisplayName(price)} si no tiene
            dependencias asociadas. No se puede deshacer.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancelar
            </Button>
          </DialogClose>
          <form method="post">
            <input type="hidden" name="intent" value="delete-price" />
            <input type="hidden" name="id" value={price.id} />
            <input type="hidden" name="confirmDeletion" value={price.id} />
            <DestroyButton />
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

import type { ReactNode } from "react";
import { AlertCircleIcon } from "lucide-react";

import { DestroyButton } from "@/components/shared/action-buttons";
import { Alert, AlertDescription } from "@/components/ui/alert";
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

function DeleteDialog({
  confirmFieldName = "confirmDeletion",
  confirmFieldValue,
  description,
  intentValue,
  open,
  onOpenChange,
  recordId,
  title = "Confirmar eliminación",
}: {
  confirmFieldName?: string;
  confirmFieldValue?: string;
  description: ReactNode;
  intentValue: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recordId: string;
  title?: string;
}) {
  const resolvedConfirmFieldValue = confirmFieldValue ?? recordId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent overlayClassName="backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <Alert variant="destructive">
            <AlertCircleIcon aria-hidden="true" />
            <AlertDescription>Esta acción es irreversible.</AlertDescription>
          </Alert>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancelar
            </Button>
          </DialogClose>
          <form method="post">
            <input type="hidden" name="intent" value={intentValue} />
            <input type="hidden" name="id" value={recordId} />
            <input
              type="hidden"
              name={confirmFieldName}
              value={resolvedConfirmFieldValue}
            />
            <DestroyButton />
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { DeleteDialog };

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
import { isRouteFormPending, useOptionalNavigation } from "@/lib/shared/forms";

function DeleteDialog({
  blockedDescription,
  blockedTitle = "No se puede eliminar",
  confirmFieldName = "confirmDeletion",
  confirmFieldValue,
  description,
  intentValue,
  isBlocked = false,
  open,
  onOpenChange,
  recordId,
  title = "Confirmar eliminación",
}: {
  blockedDescription?: ReactNode;
  blockedTitle?: string;
  confirmFieldName?: string;
  confirmFieldValue?: string;
  description: ReactNode;
  intentValue: string;
  isBlocked?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recordId: string;
  title?: string;
}) {
  const navigation = useOptionalNavigation();
  const resolvedConfirmFieldValue = confirmFieldValue ?? recordId;
  const isPending = isRouteFormPending(navigation, {
    intent: intentValue,
    fields: { id: recordId },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent overlayClassName="backdrop-blur-sm">
        <DialogHeader className="gap-3">
          <DialogTitle>{isBlocked ? blockedTitle : title}</DialogTitle>
          <Alert variant={isBlocked ? "warning" : "destructive"}>
            <AlertCircleIcon aria-hidden="true" />
            <AlertDescription>
              {isBlocked
                ? (blockedDescription ??
                  "Esta acción no está disponible para este registro.")
                : "Esta acción es irreversible."}
            </AlertDescription>
          </Alert>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={isPending}>
              {isBlocked ? "Cerrar" : "Cancelar"}
            </Button>
          </DialogClose>
          {isBlocked ? null : (
            <form method="post">
              <input type="hidden" name="intent" value={intentValue} />
              <input type="hidden" name="id" value={recordId} />
              <input
                type="hidden"
                name={confirmFieldName}
                value={resolvedConfirmFieldValue}
              />
              <DestroyButton isPending={isPending} />
            </form>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { DeleteDialog };

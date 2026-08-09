import type { ReactNode } from "react";
import { AlertCircleIcon } from "lucide-react";

import { DestroyButton } from "@/components/shared/action-buttons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { isRouteFormPending, useOptionalNavigation } from "@/lib/shared/forms";
import { cn } from "@/lib/shared/utils";

function DeleteDialog({
  blockedDescription,
  blockedTitle = "No se puede eliminar",
  confirmFieldName = "confirmDeletion",
  confirmFieldValue,
  description,
  details,
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
  /**
   * Extra context about the record, such as the list of choreographies a
   * payment touches. It is the only region that scrolls, which makes it a clip:
   * anything inside it that has to escape its box — a popover, a tooltip, a
   * sticky heading — will be cut off, and there is no way to opt out from the
   * outside.
   */
  details?: ReactNode;
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
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        // The dialog itself is bounded to the viewport, so the footer can never
        // be pushed off screen — not even on a phone in landscape, where the
        // chrome alone eats most of the height. Within that bound the details
        // are the flexible row, because they are the only part that grows with
        // the record: a payment can reach dozens of choreographies (#708).
        className={cn(
          "max-h-[calc(100dvh-2rem)]",
          details ? "grid-rows-[auto_auto_1fr_auto]" : undefined,
        )}
        onEscapeKeyDown={(event) => {
          event.preventDefault();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isBlocked ? blockedTitle : title}
          </AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <Alert variant={isBlocked ? "warning" : "destructive"}>
          <AlertCircleIcon aria-hidden="true" />
          <AlertDescription>
            {isBlocked
              ? (blockedDescription ??
                "Esta acción no está disponible para este registro.")
              : "Esta acción es irreversible."}
          </AlertDescription>
        </Alert>
        {details ? (
          <div
            data-slot="delete-dialog-details"
            className="min-h-0 overflow-y-auto overscroll-contain"
          >
            {details}
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>
            {isBlocked ? "Cerrar" : "Cancelar"}
          </AlertDialogCancel>
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
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export { DeleteDialog };

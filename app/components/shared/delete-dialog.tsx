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
        {details}
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

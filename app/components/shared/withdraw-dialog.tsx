import type { ReactNode } from "react";
import { AlertCircleIcon, Trash } from "lucide-react";

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
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { isRouteFormPending, useOptionalNavigation } from "@/lib/shared/forms";

/**
 * The confirmation of a removal that **withdraws** instead of deleting. It is
 * the shared `DeleteDialog` with its one false sentence replaced: a row that
 * keeps its money is not an irreversible deletion, so the alert says what
 * survives instead of saying that nothing does, and the button names the
 * gesture rather than `Eliminar`.
 *
 * It posts the same three fields the delete dialog posts, so a surface swaps
 * between the two by the row's evidence alone and its action reads one intent.
 */
function WithdrawDialog({
  confirmFieldName = "confirmDeletion",
  confirmLabel,
  consequence,
  description,
  intentValue,
  open,
  onOpenChange,
  recordId,
  title,
}: {
  confirmFieldName?: string;
  confirmLabel: string;
  /** What survives the removal, said in the alert the delete dialog uses for
   * "Esta acción es irreversible.". */
  consequence: ReactNode;
  description: ReactNode;
  intentValue: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recordId: string;
  title: string;
}) {
  const navigation = useOptionalNavigation();
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
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <Alert variant="warning">
          <AlertCircleIcon aria-hidden="true" />
          <AlertDescription>{consequence}</AlertDescription>
        </Alert>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
          <form method="post">
            <input type="hidden" name="intent" value={intentValue} />
            <input type="hidden" name="id" value={recordId} />
            <input type="hidden" name={confirmFieldName} value={recordId} />
            <Button type="submit" variant="destructive" disabled={isPending}>
              {isPending ? (
                <Spinner aria-hidden="true" data-icon />
              ) : (
                <Trash aria-hidden="true" data-icon="inline-start" />
              )}
              {confirmLabel}
            </Button>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export { WithdrawDialog };

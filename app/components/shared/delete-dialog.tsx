import type { ReactNode } from "react";
import { TriangleAlert } from "lucide-react";

import { DestroyButton } from "@/components/shared/action-buttons";
import { IrreversibleActionAlert } from "@/components/shared/irreversible-action-alert";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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

type DeleteDialogProps = {
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
};

/**
 * The dialog has two modes, and this is the one place that tells them apart:
 * a blocked delete explains itself and offers no destructive button, a
 * confirmable one warns and submits.
 */
function DeleteDialog({ isBlocked = false, ...props }: DeleteDialogProps) {
  return isBlocked ? (
    <BlockedDeleteDialog {...props} />
  ) : (
    <ConfirmDeleteDialog {...props} />
  );
}

function BlockedDeleteDialog({
  blockedDescription,
  blockedTitle = "No se puede eliminar",
  description,
  details,
  open,
  onOpenChange,
}: Pick<
  DeleteDialogProps,
  | "blockedDescription"
  | "blockedTitle"
  | "description"
  | "details"
  | "open"
  | "onOpenChange"
>) {
  return (
    <DeleteDialogShell
      alert={
        <Alert variant="warning">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Acción no disponible</AlertTitle>
          <AlertDescription>
            {blockedDescription ??
              "Esta acción no está disponible para este registro."}
          </AlertDescription>
        </Alert>
      }
      cancelLabel="Cerrar"
      description={description}
      details={details}
      onOpenChange={onOpenChange}
      open={open}
      title={blockedTitle}
    />
  );
}

function ConfirmDeleteDialog({
  confirmFieldName = "confirmDeletion",
  confirmFieldValue,
  description,
  details,
  intentValue,
  open,
  onOpenChange,
  recordId,
  title = "Confirmar eliminación",
}: Omit<
  DeleteDialogProps,
  "blockedDescription" | "blockedTitle" | "isBlocked"
>) {
  const navigation = useOptionalNavigation();
  const isPending = isRouteFormPending(navigation, {
    intent: intentValue,
    fields: { id: recordId },
  });

  return (
    <DeleteDialogShell
      action={
        <form method="post">
          <input type="hidden" name="intent" value={intentValue} />
          <input type="hidden" name="id" value={recordId} />
          <input
            type="hidden"
            name={confirmFieldName}
            value={confirmFieldValue ?? recordId}
          />
          <DestroyButton isPending={isPending} />
        </form>
      }
      alert={<IrreversibleActionAlert />}
      cancelLabel="Cancelar"
      description={description}
      details={details}
      isPending={isPending}
      onOpenChange={onOpenChange}
      open={open}
      title={title}
    />
  );
}

function DeleteDialogShell({
  action,
  alert,
  cancelLabel,
  description,
  details,
  isPending = false,
  onOpenChange,
  open,
  title,
}: {
  action?: ReactNode;
  alert: ReactNode;
  cancelLabel: string;
  description: ReactNode;
  details?: ReactNode;
  isPending?: boolean;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  title: string;
}) {
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
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {alert}
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
            {cancelLabel}
          </AlertDialogCancel>
          {action}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export { DeleteDialog };

import type { ReactNode } from "react";
import { Form } from "react-router";

import { DestroyButton } from "@/components/shared/action-buttons";
import { BlockedActionDialog } from "@/components/shared/blocked-action-dialog";
import { IrreversibleActionAlert } from "@/components/shared/irreversible-action-alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  isRouteFormPending,
  useCloseOnceSettled,
  useOptionalNavigation,
} from "@/lib/shared/forms";
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
  /** The question the confirmation asks, naming the record: `¿Eliminar el pago?`. */
  title: string;
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

/**
 * The blocked delete is the shared acknowledgment, with the delete's details
 * kept below the reasons in the same scrolling region the confirmable one uses.
 */
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
    <BlockedActionDialog
      className={deleteDialogContentClassName(details)}
      description={description}
      onOpenChange={onOpenChange}
      open={open}
      reasons={
        blockedDescription ??
        "Esta acción no está disponible para este registro."
      }
      reasonsTitle="Acción no disponible"
      title={blockedTitle}
    >
      {details ? <DeleteDialogDetails details={details} /> : null}
    </BlockedActionDialog>
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
  title,
}: Omit<
  DeleteDialogProps,
  "blockedDescription" | "blockedTitle" | "isBlocked"
>) {
  const navigation = useOptionalNavigation();
  const isPending = isRouteFormPending(navigation, {
    intent: intentValue,
    fields: { id: recordId },
  });

  useCloseOnceSettled({ isPending, onClose: () => onOpenChange(false) });

  return (
    <DeleteDialogShell
      action={
        <Form method="post">
          <input type="hidden" name="intent" value={intentValue} />
          <input type="hidden" name="id" value={recordId} />
          <input
            type="hidden"
            name={confirmFieldName}
            value={confirmFieldValue ?? recordId}
          />
          <DestroyButton isPending={isPending} />
        </Form>
      }
      alert={<IrreversibleActionAlert />}
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
  description,
  details,
  isPending = false,
  onOpenChange,
  open,
  title,
}: {
  action: ReactNode;
  alert: ReactNode;
  description: ReactNode;
  details?: ReactNode;
  isPending?: boolean;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  title: string;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className={deleteDialogContentClassName(details)}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {alert}
        <DeleteDialogDetails details={details} />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
          {action}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Both modes are bounded to the viewport, so the footer can never be pushed off
 * screen — not even on a phone in landscape, where the chrome alone eats most
 * of the height. Within that bound the details are the flexible row, because
 * they are the only part that grows with the record: a payment can reach dozens
 * of choreographies (#708).
 */
function deleteDialogContentClassName(details: ReactNode) {
  return cn(
    "max-h-[calc(100dvh-2rem)]",
    details ? "grid-rows-[auto_auto_1fr_auto]" : undefined,
  );
}

function DeleteDialogDetails({ details }: { details: ReactNode }) {
  return details ? (
    <div
      data-slot="delete-dialog-details"
      className="min-h-0 overflow-y-auto overscroll-contain"
    >
      {details}
    </div>
  ) : null;
}

export { DeleteDialog };

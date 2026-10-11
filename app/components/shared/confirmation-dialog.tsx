import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ConfirmationDialogProps = {
  /** Shown between the question and the footer: a warning, or the hidden
   * form the verb submits. */
  children?: ReactNode;
  /** A width override, for a dialog whose `children` need the room. */
  className?: string;
  confirmDisabled?: boolean;
  /** The icon Buttons assigns to the verb (`Check` for `Guardar`), if any. */
  confirmIcon?: LucideIcon;
  /** The verb from the title: `Archivar` for `¿Archivar al profesor?`. */
  confirmLabel: string;
  description: ReactNode;
  /** Only for an action that destroys or reverses something. */
  destructive?: boolean;
  /** The id of the form the verb submits. Without it, the verb only runs
   * `onConfirm`. */
  form?: string;
  /**
   * Whether the verb's request is in flight, for a dialog that waits on it:
   * passed at all, the verb no longer closes the dialog, and the caller
   * closes it once the request settles (`useCloseOnceSettled`). While true,
   * `Cancelar`, the verb and Escape are held.
   */
  isPending?: boolean;
  onConfirm?: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  /** A question naming the action and its object. */
  title: string;
};

/**
 * The confirmation every action that asks before it acts goes through: its
 * question, what follows from it, `Cancelar`, and the verb.
 */
export function ConfirmationDialog({
  children,
  className,
  confirmDisabled = false,
  confirmIcon: ConfirmIcon,
  confirmLabel,
  description,
  destructive = false,
  form,
  isPending,
  onConfirm,
  onOpenChange,
  open,
  title,
}: ConfirmationDialogProps) {
  // A dialog that waits on its request keeps the verb from closing it, so
  // the verb is a plain button rather than Radix's closing action.
  const Verb = isPending === undefined ? AlertDialogAction : Button;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (isPending) {
          return;
        }
        onOpenChange(next);
      }}
    >
      <AlertDialogContent className={className}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
          <Verb
            disabled={confirmDisabled || isPending}
            // The form submits from the click itself, not from a submit
            // button's default action: unless the dialog waits on its
            // request, the click also closes it, a caller may unmount it
            // —form included— on close, and a browser drops the submission
            // of a form that is no longer in the document.
            onClick={() => {
              if (form) {
                getConfirmationForm(form).requestSubmit();
              }
              onConfirm?.();
            }}
            type="button"
            variant={destructive ? "destructive" : "default"}
          >
            {isPending ? (
              <Spinner aria-hidden="true" data-icon="inline-start" />
            ) : ConfirmIcon ? (
              <ConfirmIcon aria-hidden="true" data-icon="inline-start" />
            ) : null}
            {confirmLabel}
          </Verb>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function getConfirmationForm(id: string) {
  const form = document.getElementById(id);

  if (!(form instanceof HTMLFormElement)) {
    throw new Error(`Expected the form "${id}" to be rendered.`);
  }

  return form;
}

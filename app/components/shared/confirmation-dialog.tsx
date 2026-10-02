import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

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
  onConfirm,
  onOpenChange,
  open,
  title,
}: ConfirmationDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className={className}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={confirmDisabled}
            // The form submits from the click itself, not from a submit
            // button's default action: the click also closes the dialog, a
            // caller may unmount it —form included— on close, and a browser
            // drops the submission of a form that is no longer in the
            // document.
            onClick={() => {
              if (form) {
                getConfirmationForm(form).requestSubmit();
              }
              onConfirm?.();
            }}
            type="button"
            variant={destructive ? "destructive" : "default"}
          >
            {ConfirmIcon ? (
              <ConfirmIcon aria-hidden="true" data-icon="inline-start" />
            ) : null}
            {confirmLabel}
          </AlertDialogAction>
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

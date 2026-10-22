import type { ReactNode, SubmitEventHandler } from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * A confirmation that becomes the progress of what it confirmed: a run of
 * requests the browser sends one after the other, such as a bulk emission
 * (#617). The plan is the question; once confirmed the same dialog lists what
 * each request did. It is an `AlertDialog`, so an outside click never closes
 * it, and it refuses to close at all while `busy`: closing would hide a run
 * that is still sending.
 *
 * Bounded to the viewport, with the body as the row that gives way and
 * scrolls, since a run can list a whole roster.
 */
export function BulkRunDialog({
  actions,
  busy,
  cancelLabel,
  children,
  description,
  onOpenChange,
  onSubmit,
  open,
  title,
}: {
  /** The footer's buttons beside `cancelLabel`: the verb, or `Detener`. */
  actions?: ReactNode;
  busy: boolean;
  /** `Cancelar` before the run, `Cerrar` after it, none while it runs. */
  cancelLabel: string | null;
  children: ReactNode;
  description: ReactNode;
  onOpenChange: (open: boolean) => void;
  /** The plan's submit: given, the dialog is a form and its verb submits it. */
  onSubmit?: SubmitEventHandler<HTMLFormElement>;
  open: boolean;
  /** A question before the run (`¿Emitir los comprobantes?`), its state after. */
  title: string;
}) {
  const content = (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
      </AlertDialogHeader>
      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
        {children}
      </div>
      <AlertDialogFooter>
        {cancelLabel === null ? null : (
          <AlertDialogCancel type="button" disabled={busy}>
            {cancelLabel}
          </AlertDialogCancel>
        )}
        {actions}
      </AlertDialogFooter>
    </>
  );

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) {
          onOpenChange(next);
        }
      }}
    >
      <AlertDialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-lg">
        {onSubmit ? (
          <form className="contents" noValidate onSubmit={onSubmit}>
            {content}
          </form>
        ) : (
          content
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}

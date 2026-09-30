import type { LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

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
import { acknowledgedDuplicateIdsField } from "@/lib/shared/duplicate-warning";

type DuplicateWarningDialogProps = {
  children: ReactNode;
  /**
   * The title's verb with its icon, saving anyway: a submit into the form, or
   * a fetcher resubmit.
   */
  confirmButton: ReactNode;
  /** The save the dialog confirmed is in flight. */
  isPending: boolean;
  /** A question naming the save the matches interrupted and its object. */
  title: string;
  /**
   * The server's answer that found the matches. Each answer is a new object,
   * so a save that is warned again reopens the dialog the user cancelled.
   */
  warning: object;
};

/**
 * The confirmation a save that found a possible duplicate asks for: the
 * matches the server found, `Cancelar` to go back and correct the form, and a
 * way to save anyway.
 */
export function DuplicateWarningDialog({
  children,
  confirmButton,
  isPending,
  title,
  warning,
}: DuplicateWarningDialogProps) {
  const [open, setOpen] = useState(true);
  const [lastWarning, setLastWarning] = useState(warning);

  if (warning !== lastWarning) {
    setLastWarning(warning);
    setOpen(true);
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent className="sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div>{children}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
          {confirmButton}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * The form side of the duplicate warning: the same values submitted again,
 * carrying the ids of the matches the user saw. The server warns again when a
 * match those ids do not cover appeared meanwhile. The dialog renders outside
 * the form, so the submit and the ids reach it through the `form` attribute.
 */
export function DuplicateWarningPrompt({
  children,
  confirmIcon: ConfirmIcon,
  confirmLabel,
  formId,
  isPending,
  matchIds,
  title,
  warning,
}: Omit<DuplicateWarningDialogProps, "confirmButton"> & {
  confirmIcon: LucideIcon;
  /** The verb from the title. */
  confirmLabel: string;
  formId: string;
  matchIds: readonly string[];
}) {
  return (
    <DuplicateWarningDialog
      isPending={isPending}
      title={title}
      warning={warning}
      confirmButton={
        <>
          {matchIds.map((matchId) => (
            <input
              key={matchId}
              form={formId}
              name={acknowledgedDuplicateIdsField}
              type="hidden"
              value={matchId}
            />
          ))}
          <Button form={formId} type="submit" disabled={isPending}>
            {isPending ? (
              <Spinner aria-hidden="true" data-icon />
            ) : (
              <ConfirmIcon aria-hidden="true" data-icon="inline-start" />
            )}
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </DuplicateWarningDialog>
  );
}

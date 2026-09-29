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
import { acknowledgedDuplicateIdsField } from "@/lib/shared/duplicate-warning";

type DuplicateWarningDialogProps = {
  children: ReactNode;
  /** The continue action: a submit into the form, or a fetcher resubmit. */
  continueButton: ReactNode;
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
  continueButton,
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
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div>{children}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          {continueButton}
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
  formId,
  matchIds,
  title,
  warning,
}: Omit<DuplicateWarningDialogProps, "continueButton"> & {
  formId: string;
  matchIds: readonly string[];
}) {
  return (
    <DuplicateWarningDialog
      title={title}
      warning={warning}
      continueButton={
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
          <Button form={formId} type="submit">
            Continuar de todos modos
          </Button>
        </>
      }
    >
      {children}
    </DuplicateWarningDialog>
  );
}

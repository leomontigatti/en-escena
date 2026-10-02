import { ExternalLink, type LucideIcon } from "lucide-react";
import { Fragment, useState, type ReactNode } from "react";

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

/**
 * A match's name, linking to its page in a new tab: the dialog sits over a
 * half-filled form, and leaving the page would lose it or trip the discard
 * guard, so the comparison happens beside it. Same shape as the file previews
 * in `read-only-document-image-field.tsx`.
 */
export function DuplicateMatchLink({
  children,
  href,
}: {
  children: ReactNode;
  href: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-baseline gap-1 rounded-sm font-medium text-brand underline-offset-4 hover:text-brand/80 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      {children}
      <ExternalLink aria-hidden="true" className="size-3.5 self-center" />
    </a>
  );
}

/** `formatSpanishList` for nodes: `a, b y c`. */
export function joinSpanishList(items: readonly ReactNode[]) {
  return items.map((item, index) => (
    <Fragment key={index}>
      {index === 0 ? null : index === items.length - 1 ? " y " : ", "}
      {item}
    </Fragment>
  ));
}

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
      <AlertDialogContent>
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
              <Spinner aria-hidden="true" data-icon="inline-start" />
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

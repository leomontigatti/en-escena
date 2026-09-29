import { useCallback, useEffect, useState } from "react";
import { useBlocker } from "react-router";

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
import {
  discardChangesCancelLabel,
  discardChangesConfirmLabel,
  discardChangesDescription,
  discardChangesTitle,
  hasUnsavedChanges,
  reduceDiscardGuard,
  type UnsavedChangesSources,
} from "@/lib/shared/discard-guard";

type DiscardGuardOptions = UnsavedChangesSources & {
  /** Run once the form may close: either it was clean, or the judge discarded. */
  onClose: () => void;
};

/**
 * Puts {@link reduceDiscardGuard} between a form and every way of leaving it.
 * The caller routes each of those — a dialog's X and Esc, `Cancelar`, the
 * sheet's `Volver` — through `requestClose`, and renders
 * {@link DiscardChangesDialog} with the props it hands back.
 *
 * Saving is not one of those ways: a form that closes because the save
 * succeeded calls `onClose` itself and is never asked about.
 */
export function useDiscardGuard({
  isAudioDirty,
  isFormDirty,
  onClose,
}: DiscardGuardOptions) {
  const [isAskingToDiscard, setIsAskingToDiscard] = useState(false);

  const apply = useCallback(
    (outcome: ReturnType<typeof reduceDiscardGuard>) => {
      setIsAskingToDiscard(outcome.state.isAskingToDiscard);

      if (outcome.closes) {
        onClose();
      }
    },
    [onClose],
  );

  const requestClose = useCallback(() => {
    apply(
      reduceDiscardGuard({
        hasUnsavedChanges: hasUnsavedChanges({ isAudioDirty, isFormDirty }),
        type: "close-requested",
      }),
    );
  }, [apply, isAudioDirty, isFormDirty]);

  const discard = useCallback(() => {
    apply(reduceDiscardGuard({ type: "discard-confirmed" }));
  }, [apply]);

  const keepEditing = useCallback(() => {
    apply(reduceDiscardGuard({ type: "discard-dismissed" }));
  }, [apply]);

  return {
    discardDialogProps: {
      onDiscard: discard,
      onKeepEditing: keepEditing,
      open: isAskingToDiscard,
    },
    requestClose,
  };
}

/**
 * The page's side of the same question. Every way out of a page is a
 * navigation —`Volver`, the sidebar, the breadcrumbs, the browser's back— or a
 * closing tab, so the guard sits on the router rather than on any one button,
 * and asks once for all of them.
 *
 * The save is the one way out it lets through. A save that posts to the page's
 * own URL never looks like leaving; one that goes elsewhere passes
 * `isSaving` as a ref it sets before submitting, because the navigation starts
 * before a re-render could report it.
 */
export function useUnsavedChangesGuard({
  isDirty,
  isSaving,
}: {
  isDirty: boolean;
  isSaving: boolean | { readonly current: boolean };
}): DiscardChangesDialogProps {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty &&
      !readFlag(isSaving) &&
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search),
  );

  useEffect(() => {
    if (!isDirty) {
      return;
    }

    const warn = (event: BeforeUnloadEvent) => {
      if (readFlag(isSaving)) {
        return;
      }

      event.preventDefault();
    };

    window.addEventListener("beforeunload", warn);

    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty, isSaving]);

  return {
    onDiscard: () => blocker.proceed?.(),
    onKeepEditing: () => blocker.reset?.(),
    open: blocker.state === "blocked",
  };
}

function readFlag(flag: boolean | { readonly current: boolean }) {
  return typeof flag === "boolean" ? flag : flag.current;
}

export type DiscardChangesDialogProps = ReturnType<
  typeof useDiscardGuard
>["discardDialogProps"];

/** The question itself, small and centered over the form it guards. */
export function DiscardChangesDialog({
  onDiscard,
  onKeepEditing,
  open,
}: DiscardChangesDialogProps) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onKeepEditing();
        }
      }}
    >
      <AlertDialogContent className="sm:max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{discardChangesTitle}</AlertDialogTitle>
          <AlertDialogDescription>
            {discardChangesDescription}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onKeepEditing}>
            {discardChangesCancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onDiscard}>
            {discardChangesConfirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

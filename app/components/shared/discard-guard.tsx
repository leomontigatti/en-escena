import { useCallback, useState } from "react";

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

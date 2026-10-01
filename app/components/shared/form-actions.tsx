import { Undo2 } from "lucide-react";
import type { ComponentProps } from "react";

import { BackButton, SubmitButton } from "@/components/shared/action-buttons";
import {
  DiscardChangesDialog,
  useUnsavedChangesGuard,
} from "@/components/shared/discard-guard";
import { PinnedActions } from "@/components/shared/pinned-actions";
import { Button } from "@/components/ui/button";

type FormActionsProps = {
  backTo: ComponentProps<typeof BackButton>["to"];
  /** Without it the footer is `Volver` alone, and nothing is guarded. */
  canEdit?: boolean;
  /**
   * Whatever else holds `Guardar` back while there are changes: a preview in
   * flight, a choice still to make.
   */
  canSave?: boolean;
  /** The id of the form `Guardar` submits, when the footer sits outside it. */
  form?: string;
  /**
   * Whether the form differs from what is saved. A save the server refused
   * counts: its refill of what was typed would otherwise read as clean.
   */
  hasChanges: boolean;
  isPending: boolean;
  onDiscard: () => void;
  /**
   * Whether `Guardar` is offered here. A tab with no field of the form shows
   * `Volver` alone, and the changes made on the other tab stay guarded.
   */
  showsSave?: boolean;
  viewTransition?: boolean;
};

/**
 * A form page's footer, pinned to the bottom of the viewport: `Volver`, and
 * `Guardar` with `Descartar cambios` beside it while there is something to
 * discard. It also asks before the page is left with unsaved changes, by any
 * way out, so a form gets the whole rule by rendering it.
 */
export function FormActions({
  backTo,
  canEdit = true,
  canSave = true,
  form,
  hasChanges,
  isPending,
  onDiscard,
  showsSave = true,
  viewTransition,
}: FormActionsProps) {
  const discardDialog = useUnsavedChangesGuard({
    isDirty: canEdit && hasChanges,
    isSaving: isPending,
  });

  return (
    <>
      <PinnedActions>
        <BackButton to={backTo} viewTransition={viewTransition} />
        {canEdit && showsSave ? (
          <div className="flex items-center gap-3">
            {hasChanges ? (
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={onDiscard}
              >
                <Undo2 aria-hidden="true" data-icon="inline-start" />
                Descartar cambios
              </Button>
            ) : null}
            <SubmitButton
              disabled={!hasChanges || !canSave}
              form={form}
              isPending={isPending}
            />
          </div>
        ) : null}
      </PinnedActions>
      <DiscardChangesDialog {...discardDialog} />
    </>
  );
}

/**
 * The rule behind "¿Descartar los cambios?": what a form does when something
 * asks it to close. A judge scores from a tablet in a dark theatre, where a
 * stray tap is an accident and behind it is a score nobody would get back, so a
 * form with something to lose asks before it closes and a clean one never does.
 *
 * It is a plain reducer over close events rather than a hook so the question can be answered the
 * same way wherever a form closes — a dialog's X, Esc or `Cancelar` today, the
 * sheet's `Volver` and its blocked navigation next.
 */

/** What the judge reads when a dirty form is asked to close. */
export const discardChangesTitle = "¿Descartar los cambios?";
export const discardChangesDescription =
  "Si salís ahora, se pierde lo que cargaste.";
export const discardChangesConfirmLabel = "Descartar";
export const discardChangesCancelLabel = "Seguir editando";

/**
 * Everything a form can have to lose. The fields are what React Hook Form calls
 * dirty; the audio is a `Devolución` recorded or deleted since the last save,
 * which no field state knows about.
 */
export type UnsavedChangesSources = {
  isAudioDirty: boolean;
  isFormDirty: boolean;
};

export function hasUnsavedChanges({
  isAudioDirty,
  isFormDirty,
}: UnsavedChangesSources) {
  return isFormDirty || isAudioDirty;
}

export type DiscardGuardState = {
  isAskingToDiscard: boolean;
};

const idleDiscardGuardState: DiscardGuardState = {
  isAskingToDiscard: false,
};

export type DiscardGuardEvent =
  | { hasUnsavedChanges: boolean; type: "close-requested" }
  | { type: "discard-confirmed" }
  | { type: "discard-dismissed" };

export type DiscardGuardOutcome = {
  /** Whether the form may close now. */
  closes: boolean;
  state: DiscardGuardState;
};

export function reduceDiscardGuard(
  event: DiscardGuardEvent,
): DiscardGuardOutcome {
  switch (event.type) {
    case "close-requested": {
      if (event.hasUnsavedChanges) {
        return { closes: false, state: { isAskingToDiscard: true } };
      }

      return { closes: true, state: idleDiscardGuardState };
    }
    case "discard-confirmed": {
      return { closes: true, state: idleDiscardGuardState };
    }
    case "discard-dismissed": {
      return { closes: false, state: idleDiscardGuardState };
    }
  }
}

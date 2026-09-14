/**
 * The two guards every price list shares, choreography and seminar alike: a row
 * some inscription stored is frozen except for its name, and the deadline-less
 * row that keeps registration open cannot be restructured or deleted while
 * inscriptions depend on it, though its amount still moves.
 *
 * The sentences are said twice — the screens show them before the submission,
 * the repositories answer with them when a row moved in between — so they live
 * outside the repositories, where the browser can read them without pulling the
 * database in. They name no cell and no group type on purpose: the screen that
 * shows them is already about that one row.
 */
export const frozenPriceUpdateError =
  "Este precio está en uso. Solo podés cambiar el nombre.";
export const frozenPriceDeleteError =
  "Este precio está en uso. No se puede borrar.";
export const uncoveredPriceUpdateError =
  "Este precio es necesario mientras haya inscripciones activas. Solo podés cambiar el nombre y el monto.";
export const uncoveredPriceDeleteError =
  "Este precio es necesario mientras haya inscripciones activas. No se puede borrar.";

// The alert above the form names both limits, because `Borrar precio` is
// disabled on sight and a disabled menu item cannot say why itself. Each
// refusal above keeps naming only the action that was refused.
export const frozenPriceNotice =
  "Este precio está en uso. Solo podés cambiar el nombre y no se puede borrar.";
export const uncoveredPriceNotice =
  "Este precio es necesario mientras haya inscripciones activas. Solo podés cambiar el nombre y el monto, y no se puede borrar.";

/** What a list item carries so a screen can read the guards on sight. */
export type PriceGuardFlags = {
  /** Some inscription stores this row, so it is frozen except for its name. */
  isReferenced: boolean;
  /** It is the deadline-less row that keeps registration open. */
  keepsRegistrationOpen: boolean;
};

/**
 * What the guards would refuse on a row, so the form locks a field on sight
 * instead of refusing after the save. The server refuses all the same, for the
 * race.
 */
export type PriceGuard = {
  canEditAmount: boolean;
  canEditStructure: boolean;
  reason: string | null;
};

export const openPriceGuard: PriceGuard = {
  canEditAmount: true,
  canEditStructure: true,
  reason: null,
};

export function readPriceGuard(flags: PriceGuardFlags): PriceGuard {
  if (flags.isReferenced) {
    return {
      canEditAmount: false,
      canEditStructure: false,
      reason: frozenPriceNotice,
    };
  }

  if (flags.keepsRegistrationOpen) {
    return {
      canEditAmount: true,
      canEditStructure: false,
      reason: uncoveredPriceNotice,
    };
  }

  return openPriceGuard;
}

/** Why the delete dialog opens blocked, or `null` when it does not. */
export function readPriceDeletionBlock(flags: PriceGuardFlags) {
  if (flags.isReferenced) {
    return frozenPriceDeleteError;
  }

  if (flags.keepsRegistrationOpen) {
    return uncoveredPriceDeleteError;
  }

  return null;
}

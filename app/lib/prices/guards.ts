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
// A special choreography price in use still takes and drops schedules, so its
// refusal and its notice name that too.
export const frozenSpecialPriceUpdateError =
  "Este precio está en uso. Solo podés cambiar el nombre y los cronogramas.";
export const frozenPriceDeleteError =
  "Este precio está en uso. No se puede eliminar.";
export const uncoveredPriceUpdateError =
  "Este precio es necesario mientras haya inscripciones activas. Solo podés cambiar el nombre y el monto.";
export const uncoveredPriceDeleteError =
  "Este precio es necesario mientras haya inscripciones activas. No se puede eliminar.";

// The alert above the form adds what unlocks the fields, as the Detail pages
// rule asks. An inscription below its deposit can switch to another price, and
// one without money is deleted, so the lock lifts once none has this one
// selected; a withdrawn inscription keeps its price for good. The refusals
// above stay short, since they answer a save that was already made.
const frozenPriceUnlock =
  "Se libera cuando ninguna inscripción lo tenga elegido; las retiradas lo conservan.";
const uncoveredPriceUnlock =
  "Se libera cuando no queden inscripciones activas.";
export const frozenPriceNotice = `${frozenPriceUpdateError} ${frozenPriceUnlock}`;
export const frozenSpecialPriceNotice = `${frozenSpecialPriceUpdateError} ${frozenPriceUnlock}`;
export const uncoveredPriceNotice = `${uncoveredPriceUpdateError} ${uncoveredPriceUnlock}`;

/** What a list item carries so a screen can read the guards on sight. */
export type PriceGuardFlags = {
  /** Some inscription stores this row, so it is frozen except for its name. */
  isReferenced: boolean;
  /** It is the deadline-less row that keeps registration open. */
  keepsRegistrationOpen: boolean;
  /** A special choreography price; seminar prices never are. */
  isSpecialPrice?: boolean;
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
      reason: flags.isSpecialPrice
        ? frozenSpecialPriceNotice
        : frozenPriceNotice,
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

/**
 * Why the delete dialog opens blocked and what it would take, or `null` when it
 * does not. The alert above the form speaks of the fields only (`reason`
 * above): `Eliminar` stays enabled and answers with this.
 */
export function readPriceDeletionBlock(flags: PriceGuardFlags) {
  if (flags.isReferenced) {
    return {
      reason: frozenPriceDeleteError,
      wayOut:
        "Se puede eliminar cuando ninguna inscripción lo tenga elegido, retiradas incluidas.",
    };
  }

  if (flags.keepsRegistrationOpen) {
    return {
      reason: uncoveredPriceDeleteError,
      wayOut: "Se puede eliminar cuando no queden inscripciones activas.",
    };
  }

  return null;
}

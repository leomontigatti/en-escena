/**
 * What a birth-date correction reports back: the choreographies it moved to
 * another category, and whether the move left one without an experience level.
 * The wording differs by audience because only the administrator can pick the
 * level again — see docs/domain/choreographies.md, "Birthdate Correction".
 */

/** One choreography the correction re-placed, as the report names it. */
export type RecategorisedChoreography = {
  choreographyId: string;
  name: string;
  categoryName: string;
  experienceLevelCleared: boolean;
};

export type RecategorisationAudience = "academy" | "admin";

export const recategorisationReportTitle = "Coreografías recategorizadas";

/**
 * The alert's variant: a cleared level is something the user has to act on,
 * a plain move is not.
 */
export function getRecategorisationReportVariant(
  choreographies: RecategorisedChoreography[],
): "info" | "warning" {
  return choreographies.some(
    (choreography) => choreography.experienceLevelCleared,
  )
    ? "warning"
    : "info";
}

/**
 * The sentence that follows the choreography's name, which the surface renders
 * as a link to its detail.
 */
export function buildRecategorisationSentence(input: {
  audience: RecategorisationAudience;
  choreography: RecategorisedChoreography;
}) {
  const { audience, choreography } = input;
  const moved = ` pasó a la categoría ${choreography.categoryName}`;

  if (!choreography.experienceLevelCleared) {
    return `${moved}.`;
  }

  const repair =
    audience === "admin"
      ? "Podés elegirlo desde el detalle."
      : "Comunicate con nosotros para poder solucionarlo.";

  return `${moved} y quedó sin nivel de experiencia. ${repair}`;
}

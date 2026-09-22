/**
 * What a birth-date correction reports back: the choreographies it moved to
 * another category, and whether the move left one without an experience level.
 * The wording differs by surface because only the administrator can pick the
 * level again — see docs/domain/choreographies.md, "Birthdate Correction".
 */

/** One choreography the correction re-placed, as the report names it. */
export type RecategorisedChoreography = {
  choreographyId: string;
  name: string;
  categoryName: string;
  experienceLevelCleared: boolean;
};

/** The surface reading the report, named as `setRosterPersonStatus` names it. */
export type RecategorisationSurface = "admin" | "portal";

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
 * What the line says after the choreography's name, which the surface renders
 * as a link to its detail. The name and this are separated by the surface, so
 * the returned text neither opens nor expects a space.
 */
export function buildRecategorisationSuffix(input: {
  choreography: RecategorisedChoreography;
  surface: RecategorisationSurface;
}) {
  const { choreography, surface } = input;
  const moved = `pasó a la categoría ${choreography.categoryName}`;

  if (!choreography.experienceLevelCleared) {
    return `${moved}.`;
  }

  const repair =
    surface === "admin"
      ? "Podés elegirlo desde el detalle."
      : "Comunicate con nosotros para poder solucionarlo.";

  return `${moved} y quedó sin nivel de experiencia. ${repair}`;
}

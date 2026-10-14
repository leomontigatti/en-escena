/**
 * What a birth-date correction reports back: the choreographies it moved to
 * another category, and what the move did to each one's experience level.
 * The wording differs by surface because only the administrator can pick the
 * level again — see docs/domain/choreographies.md, "Birthdate Correction".
 */

/**
 * What the move did to the choreography's experience level:
 * - `unchanged`: nothing the user has to look at.
 * - `cleared`: the new category requires a level and does not offer the one it
 *   had, so it now has none (`Sin asignar`).
 * - `keptOutsideCategory`: a grupal kept a level its new category does not
 *   offer, which the admin surfaces flag as a mismatch to repair.
 * - `arrivedWithoutLevel`: a grupal with no level, because its old category
 *   offered none, landed in one that does and now reads `Sin nivel` without
 *   anyone having chosen it.
 */
export type ExperienceLevelOutcome =
  "unchanged" | "cleared" | "keptOutsideCategory" | "arrivedWithoutLevel";

/** One choreography the correction re-placed, as the report names it. */
export type RecategorisedChoreography = {
  choreographyId: string;
  name: string;
  categoryName: string;
  experienceLevelOutcome: ExperienceLevelOutcome;
};

/** The surface reading the report, named as `setRosterPersonStatus` names it. */
export type RecategorisationSurface = "admin" | "portal";

export const recategorisationReportTitle = "Coreografías recategorizadas";

/**
 * The alert's variant: a level the move touched is something the user has to
 * act on, a plain move is not.
 */
export function getRecategorisationReportVariant(
  choreographies: RecategorisedChoreography[],
): "info" | "warning" {
  return choreographies.some(
    (choreography) => choreography.experienceLevelOutcome !== "unchanged",
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
  const repair =
    surface === "admin"
      ? "Podés elegirlo desde el detalle."
      : "Comunicate con nosotros para poder solucionarlo.";

  switch (choreography.experienceLevelOutcome) {
    case "unchanged":
      return `${moved}.`;
    case "cleared":
      return `${moved} y quedó sin nivel de experiencia. ${repair}`;
    case "keptOutsideCategory":
      return `${moved}, que no ofrece su nivel de experiencia. ${repair}`;
    case "arrivedWithoutLevel":
      return `${moved} y quedó Sin nivel. ${repair}`;
  }
}

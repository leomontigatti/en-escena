export const choreographyNotFoundMessage = "No encontramos esa coreografía.";

/**
 * A single text for the experience-level rejection. It lives here and not in the
 * roster module because portal sign-up, roster saving and the detail's standalone
 * reassignment all share it, and the validator the three of them use cannot
 * import from the roster without inverting the dependency.
 */
export const invalidExperienceLevelMessage =
  "Elegí un nivel de experiencia válido para esta coreografía.";

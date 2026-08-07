export const choreographyNotFoundMessage = "No encontramos esa coreografía.";

/**
 * Un solo texto para el rechazo del nivel de experiencia. Vive acá y no en el
 * módulo del roster porque lo comparten el alta desde el portal, el guardado
 * del roster y la reasignación autónoma del detalle, y el validador que los
 * tres usan no puede importar del roster sin invertir la dependencia.
 */
export const invalidExperienceLevelMessage =
  "Elegí un nivel de experiencia válido para esta coreografía.";

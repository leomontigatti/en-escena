/**
 * The sentences a closed seminar is read by, in one place because they are
 * said twice: the portal footer says them before the submission, the server
 * says them back when the seminar filled up or started in between.
 */
export const seminarFullMessage = "Sin lugares disponibles.";
export const seminarStartedMessage = "El seminario ya comenzó.";

/**
 * Said by the portal footer alone: the event has no seminar price list yet, so
 * an inscription would have nothing to be charged by. It names no price and no
 * cell — that is administration's business, and no seminar surface reads money
 * (docs/domain/seminars.md, "Prices").
 */
export const seminarPricesMissingMessage =
  "Las inscripciones a este seminario todavía no están abiertas.";

/**
 * Said twice as well: the admin delete dialog warns with it before the
 * submission, and the repository refuses with it when an inscription appeared
 * in between.
 */
export const seminarHasInscriptionsMessage =
  "No se puede borrar el seminario porque tiene inscripciones.";

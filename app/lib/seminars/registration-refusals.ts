/**
 * Said twice because the portal footer says it before the submission and the
 * server says it back when the seminar started in between. Registration itself
 * is **unlimited**: a full seminar refuses no inscription, it refuses the
 * allocation that would cover a deposit (see below).
 */
export const seminarStartedMessage = "El seminario ya comenzó.";

/**
 * The refusal of the one write the quota governs: **covering the deposit is what
 * takes the place**, so the seminar fills up against allocations and never
 * against registrations. Surfaced by the money dialog's error alert, which is
 * why it names the inscription rather than the seminar's occupancy
 * (docs/domain/seminars.md, "The place").
 */
export const seminarNoPlacesForDepositMessage =
  "No quedan lugares en el seminario, así que esta inscripción no puede cubrir su seña.";

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

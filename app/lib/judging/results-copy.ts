import { BUSINESS_TIME_ZONE } from "@/lib/shared/business-time-zone";

/**
 * The copy every results-publication surface counts presentations with: the
 * event's alert, its three confirmations and the toast that follows them all
 * say the same thing, and a count of one is a `presentación`.
 */
export function formatPresentationCount(count: number) {
  return `${count} ${count === 1 ? "presentación" : "presentaciones"}`;
}

/**
 * The noun phrase the two publish confirmations count with. The article and the
 * participle agree with the count, so a single presentation does not read as
 * "las 1 presentación evaluadas".
 */
export function formatEvaluatedPresentations(count: number) {
  return count === 1
    ? "la presentación evaluada"
    : `las ${count} presentaciones evaluadas`;
}

/** The same agreement for the alert's pending line: "1 evaluada", "3 evaluadas". */
export function formatPendingEvaluations(count: number) {
  return count === 1 ? "1 evaluada" : `${count} evaluadas`;
}

/**
 * What `Mostrar resultados` and `Actualizar resultados` toast: the same message
 * either way, naming how many presentations the academies see afterwards — a
 * publication is a snapshot, not a delta.
 */
export function publishedResultsMessage(publishedCount: number) {
  return `Se publicaron los resultados de ${formatPresentationCount(publishedCount)}.`;
}

const publicationDateFormatter = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "numeric",
  timeZone: BUSINESS_TIME_ZONE,
});

const publicationTimeFormatter = new Intl.DateTimeFormat("es-AR", {
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  timeZone: BUSINESS_TIME_ZONE,
});

/**
 * When the results went out, as the alert reads it: the day and the month, and
 * the time to the minute. Always business time — the administration announces
 * the results from the venue, not from wherever the browser thinks it is.
 */
export function formatResultsPublicationMoment(publishedAt: Date) {
  return `el ${publicationDateFormatter.format(publishedAt)} a las ${publicationTimeFormatter.format(publishedAt)}`;
}

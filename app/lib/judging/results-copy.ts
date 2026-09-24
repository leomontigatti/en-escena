import { BUSINESS_TIME_ZONE } from "@/lib/shared/business-time-zone";

/**
 * The copy every results-publication surface counts presentations with: the
 * event's alert, its three confirmations and the toast that follows them all
 * say the same thing, and a count of one is a `presentación`.
 */
export function formatPresentationCount(count: number) {
  return `${count} ${count === 1 ? "presentación" : "presentaciones"}`;
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

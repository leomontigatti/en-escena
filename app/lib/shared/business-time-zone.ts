export const BUSINESS_TIME_ZONE = "America/Argentina/Cordoba";
export const BUSINESS_TIME_ZONE_UTC_OFFSET = "-03:00";

const businessDateFormatter = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeZone: BUSINESS_TIME_ZONE,
});

const longBusinessDateFormatter = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: BUSINESS_TIME_ZONE,
});

/** A date as the administration reads it, always in business time. */
export function formatBusinessDate(date: Date) {
  return businessDateFormatter.format(date);
}

/**
 * The same date spelled out — "12 de abril de 2026" — the way the schedules list
 * spells the day of a `Cronograma`. For the columns that carry one day each and
 * have the room for it, instead of a range squeezed into two lines.
 */
export function formatLongBusinessDate(date: Date) {
  return longBusinessDateFormatter.format(date);
}

export function getBusinessDateOnly(now: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const partMap = new Map(parts.map((part) => [part.type, part.value]));

  return `${partMap.get("year")}-${partMap.get("month")}-${partMap.get("day")}`;
}

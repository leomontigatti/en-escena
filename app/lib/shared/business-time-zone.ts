export const BUSINESS_TIME_ZONE = "America/Argentina/Cordoba";
export const BUSINESS_TIME_ZONE_UTC_OFFSET = "-03:00";

const businessDateFormatter = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeZone: BUSINESS_TIME_ZONE,
});

/**
 * A date as the administration reads it, always in business time. Takes what a
 * loader hands a view, which is a string once the value has crossed the wire.
 */
export function formatBusinessDate(value: Date | string) {
  return businessDateFormatter.format(
    value instanceof Date ? value : new Date(value),
  );
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

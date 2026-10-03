import { getBusinessDateOnly } from "@/lib/shared/business-time-zone";

export function isDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  // A date can be shaped right and still be no date at all —`2026-13-40`— and
  // asking an invalid one for its ISO form throws rather than answering.
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  return parsed.toISOString().slice(0, 10) === value;
}

// "Today" has a single owner: `getBusinessDateOnly()`. The server runs in UTC, so
// resolving it here with `new Date()` would advance the day from 21:00 Córdoba
// time onwards.
export function isFutureDateOnly(value: string) {
  return value > getBusinessDateOnly();
}

export type DayMonthYearParse =
  | { ok: true; dateOnly: string }
  | { ok: false; reason: "format" | "impossible" | "short-year" };

/**
 * A date typed the way Argentina writes it — day, month, year, with `/`, `-` or
 * `.` between them — as a date-only value. It is built from its parts, never by
 * `new Date(text)`, which reads `03/04` month first.
 */
export function parseDayMonthYear(text: string): DayMonthYearParse {
  const match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d+)$/.exec(text.trim());

  if (!match) {
    return { ok: false, reason: "format" };
  }

  const [, day, month, year] = match;

  // Any century a two-digit year is given would be a guess, and a wrong guess
  // is a wrong age.
  if (year.length !== 4) {
    return { ok: false, reason: "short-year" };
  }

  const dateOnly = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;

  // `isDateOnly` round-trips the value, so `31/02` is refused instead of
  // rolling over to March.
  return isDateOnly(dateOnly)
    ? { ok: true, dateOnly }
    : { ok: false, reason: "impossible" };
}

export function formatDateOnlyAsDayMonthYear(dateOnly: string) {
  const [year, month, day] = dateOnly.split("-");

  return `${day}/${month}/${year}`;
}

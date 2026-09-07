import { z } from "zod";

import { getBusinessDateOnly } from "@/lib/shared/business-time-zone";
import { isDateOnly, isFutureDateOnly } from "@/lib/shared/date-only";

/** A dancer younger than this at the event's start fits no category ladder. */
const minimumDancerAgeAtEventStart = 1;

export const invalidBirthDateMessage = "Usá una fecha válida.";
export const futureBirthDateMessage =
  "La fecha de nacimiento no puede ser futura.";
export const underageBirthDateMessage = `El Bailarín debe tener al menos ${minimumDancerAgeAtEventStart} año cumplido cuando empieza el evento.`;

/**
 * The newest birth date that still leaves a dancer old enough at `eventStartDate`.
 * Date-only strings compare lexicographically, so this doubles as the bound the
 * birth-date picker offers.
 */
export function getLatestEligibleBirthDate(eventStartDate: string) {
  const [year, month, day] = eventStartDate.split("-");
  const latestYear = Number(year) - minimumDancerAgeAtEventStart;

  return `${String(latestYear).padStart(4, "0")}-${month}-${day}`;
}

/**
 * Where the birth-date calendar opens: the roster's birth years peak around a
 * twelve-year-old, so a mis-click without touching the year dropdown lands on a
 * plainly wrong year instead of on a value that quietly passes validation.
 */
const typicalDancerAgeAtEventStart = 12;

/** The oldest month the picker offers, well below any living dancer's. */
const earliestOfferedMonth = new Date(1900, 0);

/**
 * Every bound the birth-date picker needs. They answer different questions: the
 * bound is the newest birth date that still competes, while the default month is
 * an ergonomics choice deliberately far from it. Without an active event both
 * fall back to today — the same today the refinement measures the future
 * against, so the calendar cannot offer a date the server then refuses.
 *
 * `endMonth` and `latestSelectableDate` are the same bound at two granularities:
 * `react-day-picker` bounds the month dropdown by month only, so without the
 * day-granular matcher the last month it offers still shows clickable days that
 * the refinement rejects on submit.
 */
export function getBirthDatePickerBounds(eventStartDate: string | null) {
  if (!eventStartDate || !isDateOnly(eventStartDate)) {
    const today = toLocalDate(getBusinessDateOnly());

    return {
      defaultMonth: today,
      endMonth: today,
      startMonth: earliestOfferedMonth,
      latestSelectableDate: today,
    };
  }

  const [year, month] = eventStartDate.split("-").map(Number);

  return {
    defaultMonth: new Date(year - typicalDancerAgeAtEventStart, month - 1),
    endMonth: new Date(year - minimumDancerAgeAtEventStart, month - 1),
    startMonth: earliestOfferedMonth,
    latestSelectableDate: toLocalDate(
      getLatestEligibleBirthDate(eventStartDate),
    ),
  };
}

/**
 * A date-only string as the local `Date` the calendar compares days with. The
 * day is clamped to the month because subtracting the minimum age from a 29th
 * of February lands on a day that does not exist in the resulting year.
 */
function toLocalDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const lastDayOfMonth = new Date(year, month, 0).getDate();

  return new Date(year, month - 1, Math.min(day, lastDayOfMonth));
}

/**
 * The one birth-date rule, shared by every dancer schema: a real date-only
 * string, not in the future, and old enough at the event's start. Without an
 * event start — no active event — only the first two checks apply, because age
 * is a property of a (dancer, event) pair rather than of the roster row.
 */
export function buildBirthDateRefinement(eventStartDate: string | null) {
  return (value: string, context: z.RefinementCtx) => {
    if (value.length === 0) {
      return;
    }

    if (!isDateOnly(value)) {
      context.addIssue({ code: "custom", message: invalidBirthDateMessage });
      return;
    }

    if (isFutureDateOnly(value)) {
      context.addIssue({ code: "custom", message: futureBirthDateMessage });
      return;
    }

    if (!eventStartDate || !isDateOnly(eventStartDate)) {
      return;
    }

    if (value > getLatestEligibleBirthDate(eventStartDate)) {
      context.addIssue({ code: "custom", message: underageBirthDateMessage });
    }
  };
}

/**
 * The registration rejection, naming every dancer whose birth date blocks it so
 * the academy can correct the roster itself and retry. It is deliberately not
 * the form's sentence: the form has one field in front of the user, while
 * registration has a whole roster and must say which row is the problem.
 */
export function getUnderageDancersMessage(dancerNames: string[]) {
  const names = dancerNames.join(", ");
  const age = `al menos ${minimumDancerAgeAtEventStart} año cumplido cuando empieza el evento`;

  return dancerNames.length === 1
    ? `${names} debe tener ${age}. Corregí su fecha de nacimiento y volvé a registrar la coreografía.`
    : `${names} deben tener ${age}. Corregí sus fechas de nacimiento y volvé a registrar la coreografía.`;
}

/**
 * The age guard itself, so registration — the correctness boundary, where the
 * age is measured against the event that is actually being registered into —
 * and the schemas share one floor.
 */
export function isOldEnoughAtEventStart(ageAtEventStart: number) {
  return ageAtEventStart >= minimumDancerAgeAtEventStart;
}

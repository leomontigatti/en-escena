import { z } from "zod";

import { isDateOnly, isFutureDateOnly } from "@/lib/shared/date-only";

/** A dancer younger than this at the event's start fits no category ladder. */
const minimumDancerAgeAtEventStart = 1;

export const invalidBirthDateMessage = "Usá una fecha válida.";
export const futureBirthDateMessage =
  "La fecha de nacimiento no puede ser futura.";
export const underageBirthDateMessage =
  "El Bailarín debe tener al menos 1 año cumplido cuando empieza el evento.";

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

/**
 * The months the birth-date picker opens on and the newest one it offers. They
 * answer different questions: the bound is the newest birth date that still
 * competes, while the default month is an ergonomics choice deliberately far
 * from it. Without an active event both fall back to today.
 */
export function getBirthDatePickerMonths(eventStartDate?: string | null) {
  if (!eventStartDate || !isDateOnly(eventStartDate)) {
    const today = new Date();

    return { defaultMonth: today, endMonth: today };
  }

  const [year, month] = eventStartDate.split("-").map(Number);

  return {
    defaultMonth: new Date(year - typicalDancerAgeAtEventStart, month - 1),
    endMonth: new Date(year - minimumDancerAgeAtEventStart, month - 1),
  };
}

/**
 * The one birth-date rule, shared by every dancer schema: a real date-only
 * string, not in the future, and old enough at the event's start. Without an
 * event start — no active event — only the first two checks apply, because age
 * is a property of a (dancer, event) pair rather than of the roster row.
 */
export function buildBirthDateRefinement(eventStartDate?: string | null) {
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

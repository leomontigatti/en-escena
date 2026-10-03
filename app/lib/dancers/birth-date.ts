import { z } from "zod";

import {
  isDateOnly,
  isFutureDateOnly,
  parseDayMonthYear,
} from "@/lib/shared/date-only";

/** A dancer younger than this at the event's start fits no category ladder. */
const minimumDancerAgeAtEventStart = 1;

/**
 * A dancer older than this at the event's start fits no category ladder either.
 * The ceiling exists for the same reason the floor does, but it catches a
 * different mistake: a year typed a century off (1905 for 2005) resolves no
 * category at all, and without the ceiling nothing names the birth date as the
 * cause.
 */
const maximumDancerAgeAtEventStart = 100;

export const invalidBirthDateMessage = "Usá una fecha válida.";
export const birthDateFormatMessage = "Escribí la fecha como dd/mm/aaaa.";
export const shortBirthYearMessage = "Escribí el año con 4 dígitos (ej: 2012).";
export const futureBirthDateMessage =
  "La fecha de nacimiento no puede ser futura.";
export const underageBirthDateMessage = `El bailarín debe tener al menos ${minimumDancerAgeAtEventStart} año cumplido cuando empieza el evento.`;
export const overageBirthDateMessage = `El bailarín no puede tener más de ${maximumDancerAgeAtEventStart} años cuando empieza el evento.`;

/**
 * The newest birth date that still leaves a dancer old enough at
 * `eventStartDate`. Date-only strings compare lexicographically, so the
 * refinement compares against it directly.
 */
export function getLatestEligibleBirthDate(eventStartDate: string) {
  return shiftBirthYear(eventStartDate, minimumDancerAgeAtEventStart);
}

/**
 * The bound a birth date must be strictly newer than to keep the dancer at or
 * under the maximum age at `eventStartDate`. Unlike the floor's bound this one
 * is not itself eligible: a dancer born exactly on it turns 101 on the event's
 * first day. Naming the first refused date instead of the last accepted one
 * spares the month arithmetic of adding a day, and costs nothing — the day it
 * would name can be a 29 February that no year has.
 */
function getOverageBirthDateBound(eventStartDate: string) {
  return shiftBirthYear(eventStartDate, maximumDancerAgeAtEventStart + 1);
}

/**
 * The birth date of someone turning `years` exactly on the event's first day.
 * A 29 February keeps its day: the result is only ever compared as a string,
 * and lexicographic order puts the impossible date exactly where the real
 * boundary is.
 */
function shiftBirthYear(eventStartDate: string, years: number) {
  const [year, month, day] = eventStartDate.split("-");

  return `${String(Number(year) - years).padStart(4, "0")}-${month}-${day}`;
}

/**
 * The one birth-date rule, shared by every dancer schema: a real date-only
 * string, not in the future, and neither too young nor too old at the event's
 * start. Without an event start — no active event — only the first two checks
 * apply, because age is a property of a (dancer, event) pair rather than of the
 * roster row.
 */
export function buildBirthDateRefinement(eventStartDate: string | null) {
  return (value: string, context: z.RefinementCtx) => {
    if (value.length === 0) {
      return;
    }

    if (!isDateOnly(value)) {
      context.addIssue({
        code: "custom",
        message: getTypedBirthDateMessage(value),
      });
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
      return;
    }

    if (value <= getOverageBirthDateBound(eventStartDate)) {
      context.addIssue({ code: "custom", message: overageBirthDateMessage });
    }
  };
}

/**
 * What to fix in a typed birth date that never became a date-only value. Text
 * that does read as a date is still refused: the field converts it before it
 * is posted, so only a post that skipped the field sends it, and storing it
 * as typed would break every reader of the column.
 */
function getTypedBirthDateMessage(text: string) {
  const parsed = parseDayMonthYear(text);

  // A date-only value the calendar does not have (`2026-02-30`) is no typing
  // mistake to explain.
  if (parsed.ok || /^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return invalidBirthDateMessage;
  }

  switch (parsed.reason) {
    case "format":
      return birthDateFormatMessage;
    case "short-year":
      return shortBirthYearMessage;
    case "impossible":
      return invalidBirthDateMessage;
  }
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
 * The registration rejection for the ceiling, the floor's sentence read the
 * other way round and naming the dancers for the same reason.
 */
export function getOverageDancersMessage(dancerNames: string[]) {
  const names = dancerNames.join(", ");
  const age = `más de ${maximumDancerAgeAtEventStart} años cuando empieza el evento`;

  return dancerNames.length === 1
    ? `${names} no puede tener ${age}. Corregí su fecha de nacimiento y volvé a registrar la coreografía.`
    : `${names} no pueden tener ${age}. Corregí sus fechas de nacimiento y volvé a registrar la coreografía.`;
}

/**
 * The age guard itself, so registration — the correctness boundary, where the
 * age is measured against the event that is actually being registered into —
 * and the schemas share one floor.
 */
export function isOldEnoughAtEventStart(ageAtEventStart: number) {
  return ageAtEventStart >= minimumDancerAgeAtEventStart;
}

/** The ceiling's half of the same guard, shared by the same two callers. */
export function isYoungEnoughAtEventStart(ageAtEventStart: number) {
  return ageAtEventStart <= maximumDancerAgeAtEventStart;
}

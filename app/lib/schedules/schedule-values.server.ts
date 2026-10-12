import {
  findMissingAwardCeremonyField,
  halfSetAwardCeremonyMessage,
} from "@/lib/schedules/award-ceremony";
import type { ScheduleInput } from "@/lib/schedules/repository.server";
import { requiredFieldMessage } from "@/lib/shared/forms";

/**
 * The columns the schedule repository writes from a validated input, the
 * same on every create and edit, and the validation of the date, time and
 * award ceremony among them. See GLOSSARY.md `awardCeremony`.
 */

/**
 * The schedule row's own columns from an input `validateScheduleInput`
 * accepted, whose name is already normalised.
 */
export function toScheduleColumnValues(
  input: ScheduleInput & { name: string },
) {
  return {
    name: input.name,
    scheduledDate: input.scheduledDate,
    startTime: normalizeTime(input.startTime),
    ...readAwardCeremonyValues(input),
    totalCapacity: input.totalCapacity,
  };
}

/**
 * The field errors of the schedule's date, start time and award ceremony: each
 * required one blank or malformed.
 */
export function validateScheduleTimingInput(
  input: ScheduleInput,
): Record<string, string> {
  const fieldErrors: Record<string, string> = {};

  if (input.scheduledDate.trim().length === 0) {
    fieldErrors.scheduledDate = requiredFieldMessage;
  } else if (!isValidDate(input.scheduledDate)) {
    fieldErrors.scheduledDate = "Ingresá una fecha válida.";
  }

  if (input.startTime.trim().length === 0) {
    fieldErrors.startTime = requiredFieldMessage;
  } else if (!isValidTime(input.startTime)) {
    fieldErrors.startTime = "Ingresá una hora válida.";
  }

  return { ...fieldErrors, ...validateAwardCeremonyInput(input) };
}

/**
 * The ceremony's pair, refused half-set with the form's own message and
 * refused malformed like the schedule's own date and time. Any date is valid:
 * a ceremony after midnight falls on the day after the schedule's.
 */
function validateAwardCeremonyInput(
  input: ScheduleInput,
): Record<string, string> {
  const missingField = findMissingAwardCeremonyField(input);

  if (missingField) {
    return { [missingField]: halfSetAwardCeremonyMessage };
  }

  const { awardCeremonyDate, awardCeremonyTime } = trimAwardCeremony(input);
  const fieldErrors: Record<string, string> = {};

  if (awardCeremonyDate !== "" && !isValidDate(awardCeremonyDate)) {
    fieldErrors.awardCeremonyDate = "Ingresá una fecha válida.";
  }

  if (awardCeremonyTime !== "" && !isValidTime(awardCeremonyTime)) {
    fieldErrors.awardCeremonyTime = "Ingresá una hora válida.";
  }

  return fieldErrors;
}

/**
 * The pair as the columns store it: `null` for a blank half, which validation
 * has already made sure means both, and the time in the same shape as
 * `startTime`. An input that carries neither field says nothing about the
 * ceremony, so an edit through it leaves the stored pair where it was.
 */
function readAwardCeremonyValues(input: ScheduleInput): {
  awardCeremonyDate?: string | null;
  awardCeremonyTime?: string | null;
} {
  if (
    input.awardCeremonyDate === undefined &&
    input.awardCeremonyTime === undefined
  ) {
    return {};
  }

  const { awardCeremonyDate, awardCeremonyTime } = trimAwardCeremony(input);

  return {
    awardCeremonyDate: awardCeremonyDate === "" ? null : awardCeremonyDate,
    awardCeremonyTime:
      awardCeremonyTime === "" ? null : normalizeTime(awardCeremonyTime),
  };
}

/** The pair as typed, blank for an absent half. */
function trimAwardCeremony(input: ScheduleInput) {
  return {
    awardCeremonyDate: input.awardCeremonyDate?.trim() ?? "",
    awardCeremonyTime: input.awardCeremonyTime?.trim() ?? "",
  };
}

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);

  return (
    !Number.isNaN(date.getTime()) && value === date.toISOString().slice(0, 10)
  );
}

function isValidTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function normalizeTime(value: string) {
  return value.slice(0, 5);
}

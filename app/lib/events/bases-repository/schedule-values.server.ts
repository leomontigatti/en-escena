import {
  isValidDate,
  isValidTime,
  normalizeTime,
  type ScheduleInput,
} from "@/lib/events/bases-repository/shared.server";
import {
  findMissingAwardCeremonyField,
  halfSetAwardCeremonyMessage,
} from "@/lib/schedules/award-ceremony";

/**
 * The columns the schedule repository writes from a validated input, the
 * same on every create and edit, and the validation of the award ceremony
 * pair among them. See CONTEXT.md `awardCeremony`.
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
 * The ceremony's pair, refused half-set with the form's own message and
 * refused malformed like the schedule's own date and time. Any date is valid:
 * a ceremony after midnight falls on the day after the schedule's.
 */
export function validateAwardCeremonyInput(
  input: ScheduleInput,
): Record<string, string> {
  const missingField = findMissingAwardCeremonyField(input);

  if (missingField) {
    return { [missingField]: halfSetAwardCeremonyMessage };
  }

  const awardCeremonyDate = input.awardCeremonyDate?.trim() ?? "";
  const awardCeremonyTime = input.awardCeremonyTime?.trim() ?? "";
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

  const awardCeremonyDate = input.awardCeremonyDate?.trim() ?? "";
  const awardCeremonyTime = input.awardCeremonyTime?.trim() ?? "";

  return {
    awardCeremonyDate: awardCeremonyDate === "" ? null : awardCeremonyDate,
    awardCeremonyTime:
      awardCeremonyTime === "" ? null : normalizeTime(awardCeremonyTime),
  };
}

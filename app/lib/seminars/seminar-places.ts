import { formatDate } from "@/lib/finances/formatters";

/**
 * How many places a seminar is short for the crossings a write would make:
 * **covering the deposit is what takes a place**, so `neededCount` is the
 * inscriptions the write carries across their deposit, and `coveredCount` the
 * ones already across it. Zero means the write fits.
 *
 * The places left never read below zero: a quota lowered under the places
 * already taken leaves those rows where they are, and only the new crossings
 * are short.
 */
export function countSeminarPlacesShort(input: {
  coveredCount: number;
  neededCount: number;
  quota: number;
}): number {
  const placesLeft = Math.max(0, input.quota - input.coveredCount);

  return Math.max(0, input.neededCount - placesLeft);
}

/**
 * The refusal of a write that crosses deposits in several seminars at once.
 * Unlike the single inscription's refusal it names each seminar — by
 * instructor and date, as the finance lists show it — and how many places it
 * is short, so the administrator can tell which part of the selection blocked
 * it.
 */
export function seminarPlacesShortMessage(
  shortfalls: readonly {
    instructorName: string;
    scheduledDate: string;
    shortBy: number;
  }[],
): string {
  return shortfalls
    .map(
      (shortfall) =>
        `No quedan lugares suficientes en el seminario de ${shortfall.instructorName} del ${formatDate(shortfall.scheduledDate)}: ${shortfall.shortBy === 1 ? "falta 1" : `faltan ${shortfall.shortBy}`}.`,
    )
    .join(" ");
}

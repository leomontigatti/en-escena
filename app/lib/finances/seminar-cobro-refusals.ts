import { formatAmount, formatDate } from "@/lib/finances/formatters";

/**
 * Why a seminar preset refuses a person whose new price is below the money
 * already on their inscription, worded once for the preset dialog's warning and
 * the write's refusal so the two cannot drift.
 */
export function seminarOverAllocatedMessage(input: {
  overAllocatedAmount: number;
  personName: string;
}): string {
  return `${input.personName} tiene asignados ${formatAmount(input.overAllocatedAmount)} más que el precio que le corresponde.`;
}

/**
 * Why a seminar preset refuses a charge the quota cannot hold, worded once for
 * the preset dialog's warning and the write's refusal: the multi-seminar twin
 * of `seminarNoPlacesForDepositMessage`. It names each seminar — by instructor
 * and date, as the finance lists show it — and how many places it is short, so
 * the administrator can tell which part of the selection blocked it.
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

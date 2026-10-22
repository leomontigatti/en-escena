import { formatAmount } from "@/lib/finances/formatters";

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

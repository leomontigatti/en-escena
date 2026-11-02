import { formatAmount } from "@/lib/finances/formatters";

/**
 * Why a choreography preset refuses a pick it cannot charge: the row's deposit
 * is more than the inscription can take, against what it owes today or against
 * the row's own discounted total.
 */
export function pickDepositDoesNotFitMessage(input: {
  personName: string;
  priceAmount: number;
}): string {
  return `No se puede aplicar el precio de ${formatAmount(input.priceAmount)} a ${input.personName}: la seña de ese precio supera lo que la inscripción adeuda.`;
}

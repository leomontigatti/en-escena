import type { PaymentInstructions } from "@/lib/finances/payment-instructions";

/**
 * View formatting for `PortalPaymentInstructionsAlert` alone. The domain rule —
 * when an event counts as loaded — stays in `lib/finances`.
 */

/** Whether any of the five identifiers is loaded, so the grid has a row. */
export function hasPaymentIdentifiers(instructions: PaymentInstructions) {
  return [
    instructions.cbu,
    instructions.alias,
    instructions.holderName,
    instructions.bankName,
    instructions.holderCuit,
  ].some((value) => Boolean(value));
}

/**
 * `En Escena Producciones SRL · CUIT 30-71234567-1`, either half dropped when
 * absent. The CUIT renders exactly as it was typed: the column stores it that
 * way, with or without hyphens.
 */
export function formatPaymentHolderLine(instructions: PaymentInstructions) {
  return [
    instructions.holderName,
    instructions.holderCuit ? `CUIT ${instructions.holderCuit}` : null,
  ]
    .filter((part) => Boolean(part))
    .join(" · ");
}

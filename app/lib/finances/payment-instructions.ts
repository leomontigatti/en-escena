/**
 * The event's `Instrucciones de pago` as every reader wants them: the five bank
 * identifiers and the free text, under short names and without the column
 * prefix. No dependency on forms, routes or the database.
 */
export type PaymentInstructions = {
  cbu: string | null;
  alias: string | null;
  holderName: string | null;
  bankName: string | null;
  holderCuit: string | null;
  text: string | null;
};

/** The six nullable columns as they sit on the `event` row. */
export type EventPaymentInstructionsColumns = {
  paymentInstructionsCbu: string | null;
  paymentInstructionsAlias: string | null;
  paymentInstructionsHolderName: string | null;
  paymentInstructionsBankName: string | null;
  paymentInstructionsHolderCuit: string | null;
  paymentInstructionsText: string | null;
};

/**
 * `null` unless the event is **loaded**: the CBU/CVU is set — the schema's group
 * rule guarantees a holder name comes with it — or the free text is set. An
 * event holding only, say, a bank name is not something an academy can pay
 * against, so the portal shows nothing.
 */
export function toPaymentInstructions(
  event: EventPaymentInstructionsColumns,
): PaymentInstructions | null {
  if (!event.paymentInstructionsCbu && !event.paymentInstructionsText) {
    return null;
  }

  return {
    cbu: event.paymentInstructionsCbu,
    alias: event.paymentInstructionsAlias,
    holderName: event.paymentInstructionsHolderName,
    bankName: event.paymentInstructionsBankName,
    holderCuit: event.paymentInstructionsHolderCuit,
    text: event.paymentInstructionsText,
  };
}

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

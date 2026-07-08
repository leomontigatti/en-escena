type BalanceInvoiceInsertPreview = {
  administrativeDiscountAmount: number;
  administrativeDiscountInternalReason: string | null;
  administrativeDiscountPublicLabel: string | null;
  appliedDepositAmount: number;
  balanceAmount: number;
  basePriceAmount: number;
  dancerDiscountAmount: number;
  depositCompletedOn: string;
  finalTotalAmount: number;
  issueDate: string;
  totalDiscountAmount: number;
};

export function calculateDepositAmount(input: {
  amount: number;
  percentage: number;
}) {
  return Math.round((input.amount * input.percentage) / 100);
}

export function balanceInvoiceInsertValues(input: {
  academyId: string;
  choreographyId: string;
  createdByUserId: string;
  eventId: string;
  invoiceNumber: number;
  preview: BalanceInvoiceInsertPreview;
  requiredDepositPercentageSnapshot: number;
  selectedPriceId: string | null;
  selectedPaymentDeadline: string | null;
}) {
  return {
    academyId: input.academyId,
    appliedDepositAmount: input.preview.appliedDepositAmount,
    administrativeDiscountAmount: input.preview.administrativeDiscountAmount,
    administrativeDiscountInternalReason:
      input.preview.administrativeDiscountInternalReason,
    administrativeDiscountPublicLabel:
      input.preview.administrativeDiscountPublicLabel,
    basePriceAmount: input.preview.basePriceAmount,
    choreographyId: input.choreographyId,
    createdByUserId: input.createdByUserId,
    dancerDiscountAmount: input.preview.dancerDiscountAmount,
    depositAmount: input.preview.balanceAmount,
    depositCompletedOn: input.preview.depositCompletedOn,
    eventId: input.eventId,
    finalTotalAmount: input.preview.finalTotalAmount,
    invoiceNumber: input.invoiceNumber,
    invoiceType: "saldo" as const,
    issueDate: input.preview.issueDate,
    requiredDepositPercentageSnapshot: input.requiredDepositPercentageSnapshot,
    selectedPriceId: input.selectedPriceId,
    selectedPaymentDeadline: input.selectedPaymentDeadline,
    totalDiscountAmount: input.preview.totalDiscountAmount,
  };
}

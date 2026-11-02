import { registerRefund } from "@/lib/finances/refunds.server";

/** A refund through the write module, which must accept it. */
export async function registerRefundForTest(input: {
  academyId: string;
  amount: number;
  eventId: string;
  refundDate?: string;
}) {
  const result = await registerRefund({
    academyId: input.academyId,
    amount: input.amount,
    eventId: input.eventId,
    internalNote: null,
    reference: null,
    refundDate: input.refundDate ?? "2026-04-09",
    refundMethod: "transferencia",
  });

  if (!result.ok) {
    throw new Error(`The test refund was refused: ${result.reason}`);
  }

  return result;
}

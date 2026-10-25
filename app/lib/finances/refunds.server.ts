/**
 * The refund write module: every `Reembolso` is written here, so the cap and
 * the numbering hold for every caller.
 *
 * A refund takes money out of the owner's pool for the event, so it is capped
 * at the live `Saldo disponible` (`available-balance.server.ts`), read under
 * the pool lock every other pool write takes (`lockAcademyPools`): a refund
 * and an allocation, or two refunds, that race on one pool are serialised, and
 * the second reads what the first left.
 *
 * Its number comes from the event's sequence row (`nextRefundNumber`), a
 * series of its own beside the payments', under the same row lock the payment
 * number takes. The pool lock is taken first; the payment registration takes
 * only the sequence row, so the two orders cannot cycle.
 */

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { eventSequences, refunds } from "@/db/schema";
import { lockAcademyPools } from "@/lib/finances/allocation-pool.server";
import { readAcademyAvailableBalance } from "@/lib/finances/available-balance.server";
import { formatAmount } from "@/lib/finances/formatters";
import type { PaymentMethod } from "@/lib/finances/payment-methods";

export type RegisterRefundInput = {
  academyId: string;
  amount: number;
  eventId: string;
  internalNote: string | null;
  reference: string | null;
  refundDate: string;
  refundMethod: PaymentMethod;
};

export type RefundWriteResult =
  | { ok: true; refundId: string; refundNumber: number }
  | { ok: false; message: string };

export async function registerRefund(
  input: RegisterRefundInput,
): Promise<RefundWriteResult> {
  return await db.transaction(async (tx) => {
    const pool = { academyId: input.academyId, eventId: input.eventId };

    await lockAcademyPools(tx, [pool]);
    const availableBalanceAmount = await readAcademyAvailableBalance(tx, pool);

    if (input.amount > availableBalanceAmount) {
      return {
        ok: false,
        message: refundAboveBalanceMessage(availableBalanceAmount),
      };
    }

    await tx
      .insert(eventSequences)
      .values({ eventId: input.eventId })
      .onConflictDoNothing();

    const [sequence] = await tx
      .select({ nextRefundNumber: eventSequences.nextRefundNumber })
      .from(eventSequences)
      .where(eq(eventSequences.eventId, input.eventId))
      .for("update");

    if (!sequence) {
      throw new Error("Expected event sequence to exist.");
    }

    const refundNumber = sequence.nextRefundNumber;
    const [inserted] = await tx
      .insert(refunds)
      .values({
        academyId: input.academyId,
        amount: input.amount,
        eventId: input.eventId,
        internalNote: input.internalNote,
        reference: input.reference,
        refundDate: input.refundDate,
        refundMethod: input.refundMethod,
        refundNumber,
      })
      .returning({ id: refunds.id });

    await tx
      .update(eventSequences)
      .set({ nextRefundNumber: refundNumber + 1, updatedAt: new Date() })
      .where(eq(eventSequences.eventId, input.eventId));

    return { ok: true, refundId: inserted.id, refundNumber };
  });
}

function refundAboveBalanceMessage(availableBalanceAmount: number) {
  return availableBalanceAmount === 0
    ? "No hay saldo disponible para reembolsar."
    : `El reembolso no puede superar el saldo disponible de ${formatAmount(availableBalanceAmount)}.`;
}

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
 *
 * An edit or a deletion names the refund and the version the administrator
 * read (its `updatedAt`, as an ISO string). Under the pool lock the refund is
 * read again, and one that changed or went away since is refused rather than
 * overwritten. Academy and event are never written after registration, so the
 * pool the lock was taken on stays the refund's.
 */

import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { eventSequences, refunds } from "@/db/schema";
import { lockAcademyPools } from "@/lib/finances/allocation-pool.server";
import { readAcademyAvailableBalance } from "@/lib/finances/available-balance.server";
import { formatAmount } from "@/lib/finances/formatters";
import type { Executor } from "@/lib/finances/choreography-cobro-support.server";
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

export type UpdateRefundInput = {
  amount: number;
  internalNote: string | null;
  reference: string | null;
  refundDate: string;
  refundId: string;
  refundMethod: PaymentMethod;
  /** The refund's `updatedAt` the edit was made against, as an ISO string. */
  version: string;
};

export type RefundChangeResult = { ok: true } | { ok: false; message: string };

const refundChangedMessage =
  "El reembolso cambió mientras se guardaba. Revisalo y volvé a intentarlo.";

/**
 * Corrects a refund in place. A raise is capped at the `Saldo disponible` plus
 * the refund's own current amount, which the balance already has out; lowering
 * or keeping the amount always fits under that.
 */
export async function updateRefund(
  input: UpdateRefundInput,
): Promise<RefundChangeResult> {
  return await db.transaction(async (tx) => {
    const refund = await lockRefund(tx, input);

    if (!refund) {
      return { ok: false, message: refundChangedMessage };
    }

    const capAmount =
      (await readAcademyAvailableBalance(tx, refund)) + refund.amount;

    if (input.amount > capAmount) {
      return {
        ok: false,
        message: `El reembolso no puede superar ${formatAmount(capAmount)}, el saldo disponible más su monto actual.`,
      };
    }

    await tx
      .update(refunds)
      .set({
        amount: input.amount,
        internalNote: input.internalNote,
        reference: input.reference,
        refundDate: input.refundDate,
        refundMethod: input.refundMethod,
        updatedAt: nextVersion,
      })
      .where(eq(refunds.id, refund.id));

    return { ok: true };
  });
}

/**
 * Deletes a refund recorded in error. The pool never refuses it: handing the
 * money back to the `Saldo disponible` can only raise it.
 */
export async function deleteRefund(input: {
  refundId: string;
  version: string;
}): Promise<RefundChangeResult> {
  return await db.transaction(async (tx) => {
    const refund = await lockRefund(tx, input);

    if (!refund) {
      return { ok: false, message: refundChangedMessage };
    }

    await tx.delete(refunds).where(eq(refunds.id, refund.id));

    return { ok: true };
  });
}

/**
 * The refund at the version the caller read, under its pool lock and its row
 * lock, or `null` when it changed or no longer exists.
 */
async function lockRefund(
  tx: Executor,
  input: { refundId: string; version: string },
) {
  const [pool] = await tx
    .select({ academyId: refunds.academyId, eventId: refunds.eventId })
    .from(refunds)
    .where(eq(refunds.id, input.refundId));

  if (!pool) {
    return null;
  }

  await lockAcademyPools(tx, [pool]);

  const [refund] = await tx
    .select({
      academyId: refunds.academyId,
      amount: refunds.amount,
      eventId: refunds.eventId,
      id: refunds.id,
      updatedAt: refunds.updatedAt,
    })
    .from(refunds)
    .where(eq(refunds.id, input.refundId))
    .for("update");

  return refund?.updatedAt.toISOString() === input.version ? refund : null;
}

/**
 * A version is read at millisecond precision, so a write moves it at least a
 * millisecond past the last one: two edits in one millisecond would otherwise
 * read as one version.
 */
const nextVersion = sql`greatest(clock_timestamp(), ${refunds.updatedAt} + interval '1 millisecond')`;

function refundAboveBalanceMessage(availableBalanceAmount: number) {
  return availableBalanceAmount === 0
    ? "No hay saldo disponible para reembolsar."
    : `El reembolso no puede superar el saldo disponible de ${formatAmount(availableBalanceAmount)}.`;
}

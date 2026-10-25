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
 * overwritten. Only the academy merge moves a refund to another pool, and it
 * moves the version too (`nextRefundVersion`); a refund found under the lock in
 * another pool than the one locked is refused as well.
 *
 * Refusals are reason codes; the request handlers map them to copy.
 */

import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { eventSequences, refunds } from "@/db/schema";
import { lockAcademyPools } from "@/lib/finances/allocation-pool.server";
import { readAcademyAvailableBalance } from "@/lib/finances/available-balance.server";
import type { Executor } from "@/lib/finances/choreography-cobro-support.server";
import type { PaymentMethod } from "@/lib/finances/payment-methods";
import { isFutureDateOnly } from "@/lib/shared/date-only";

export type RegisterRefundInput = {
  academyId: string;
  amount: number;
  eventId: string;
  internalNote: string | null;
  reference: string | null;
  refundDate: string;
  refundMethod: PaymentMethod;
};

/**
 * Why a refund write was refused: no free money at all, an amount above the
 * cap (`capAmount`), a date after today, or, on an edit or a deletion, a
 * refund that changed, went away or moved to another pool since it was read.
 */
export type RefundRefusal =
  | { ok: false; reason: "no-balance" }
  | { ok: false; reason: "over-cap"; capAmount: number }
  | { ok: false; reason: "future-date" }
  | { ok: false; reason: "stale" }
  | { ok: false; reason: "moved" };

export type RefundWriteResult =
  | { ok: true; refundId: string; refundNumber: number }
  | Extract<
      RefundRefusal,
      { reason: "future-date" | "no-balance" | "over-cap" }
    >;

export async function registerRefund(
  input: RegisterRefundInput,
): Promise<RefundWriteResult> {
  if (isFutureDateOnly(input.refundDate)) {
    return { ok: false, reason: "future-date" };
  }

  return await db.transaction(async (tx): Promise<RefundWriteResult> => {
    const pool = { academyId: input.academyId, eventId: input.eventId };

    await lockAcademyPools(tx, [pool]);
    const availableBalanceAmount = await readAcademyAvailableBalance(tx, pool);

    if (availableBalanceAmount <= 0) {
      return { ok: false, reason: "no-balance" };
    }

    if (input.amount > availableBalanceAmount) {
      return {
        ok: false,
        reason: "over-cap",
        capAmount: availableBalanceAmount,
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

export type RefundChangeResult =
  | { ok: true }
  | Extract<
      RefundRefusal,
      { reason: "future-date" | "moved" | "over-cap" | "stale" }
    >;

/**
 * Corrects a refund in place. A raise is capped at the `Saldo disponible` plus
 * the refund's own current amount, which the balance already has out; lowering
 * or keeping the amount always fits under that.
 */
export async function updateRefund(
  input: UpdateRefundInput,
): Promise<RefundChangeResult> {
  if (isFutureDateOnly(input.refundDate)) {
    return { ok: false, reason: "future-date" };
  }

  return await db.transaction(async (tx): Promise<RefundChangeResult> => {
    const locked = await lockRefund(tx, input);

    if (!locked.ok) {
      return locked;
    }

    const { refund } = locked;
    const capAmount =
      (await readAcademyAvailableBalance(tx, refund)) + refund.amount;

    if (input.amount > capAmount) {
      return { ok: false, reason: "over-cap", capAmount };
    }

    await tx
      .update(refunds)
      .set({
        amount: input.amount,
        internalNote: input.internalNote,
        reference: input.reference,
        refundDate: input.refundDate,
        refundMethod: input.refundMethod,
        updatedAt: nextRefundVersion,
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
  return await db.transaction(async (tx): Promise<RefundChangeResult> => {
    const locked = await lockRefund(tx, input);

    if (!locked.ok) {
      return locked;
    }

    await tx.delete(refunds).where(eq(refunds.id, locked.refund.id));

    return { ok: true };
  });
}

/**
 * The refund at the version the caller read, under its pool lock and its row
 * lock. `stale` when it changed or no longer exists; `moved` when, by the time
 * the lock was granted, it sat in another pool than the one locked.
 */
async function lockRefund(
  tx: Executor,
  input: { refundId: string; version: string },
): Promise<
  | {
      ok: true;
      refund: {
        academyId: string;
        amount: number;
        eventId: string;
        id: string;
      };
    }
  | Extract<RefundRefusal, { reason: "moved" | "stale" }>
> {
  const [pool] = await tx
    .select({ academyId: refunds.academyId, eventId: refunds.eventId })
    .from(refunds)
    .where(eq(refunds.id, input.refundId));

  if (!pool) {
    return { ok: false, reason: "stale" };
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

  if (!refund) {
    return { ok: false, reason: "stale" };
  }

  if (refund.academyId !== pool.academyId || refund.eventId !== pool.eventId) {
    return { ok: false, reason: "moved" };
  }

  return refund.updatedAt.toISOString() === input.version
    ? { ok: true, refund }
    : { ok: false, reason: "stale" };
}

/**
 * The `updatedAt` every write to a refund sets, its version. A version is read
 * at millisecond precision, so a write moves it at least a millisecond past
 * the last one: two edits in one millisecond would otherwise read as one
 * version.
 */
export const nextRefundVersion = sql`greatest(clock_timestamp(), ${refunds.updatedAt} + interval '1 millisecond')`;

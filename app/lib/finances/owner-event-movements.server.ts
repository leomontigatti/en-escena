import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { payments, refunds } from "@/db/schema";
import type { MovementKind } from "@/lib/finances/movement-kinds";
import type { PaymentMethod } from "@/lib/finances/payment-methods";

/** One `Movimiento` an owner reads of itself: a payment or a refund. */
export type OwnerEventMovement = {
  amount: number;
  date: string;
  id: string;
  kind: MovementKind;
  method: PaymentMethod;
  /** The movement's number in its own series: payments and refunds count apart. */
  number: number;
  reference: string | null;
};

/**
 * An owner's payments and refunds within an event, newest first: an academy's
 * for the portal, an individual's for its own area (ADR-0019). Amounts are
 * positive and the kind tells money in from money out; two movements of one
 * day keep the order they were recorded in. It never exposes an internal
 * note: that is for administrative use and this read feeds the owner's own
 * screens.
 */
export async function readOwnerEventMovements(input: {
  academyId: string;
  eventId: string;
}): Promise<OwnerEventMovement[]> {
  const [paymentRows, refundRows] = await Promise.all([
    db
      .select({
        amount: payments.amount,
        createdAt: payments.createdAt,
        date: payments.paymentDate,
        id: payments.id,
        method: payments.paymentMethod,
        number: payments.paymentNumber,
        reference: payments.reference,
      })
      .from(payments)
      .where(
        and(
          eq(payments.academyId, input.academyId),
          eq(payments.eventId, input.eventId),
        ),
      ),
    db
      .select({
        amount: refunds.amount,
        createdAt: refunds.createdAt,
        date: refunds.refundDate,
        id: refunds.id,
        method: refunds.refundMethod,
        number: refunds.refundNumber,
        reference: refunds.reference,
      })
      .from(refunds)
      .where(
        and(
          eq(refunds.academyId, input.academyId),
          eq(refunds.eventId, input.eventId),
        ),
      ),
  ]);

  return [
    ...paymentRows.map((row) => ({ ...row, kind: "payment" as const })),
    ...refundRows.map((row) => ({ ...row, kind: "refund" as const })),
  ]
    .sort(
      (left, right) =>
        right.date.localeCompare(left.date) ||
        right.createdAt.getTime() - left.createdAt.getTime(),
    )
    .map(({ createdAt: _createdAt, ...row }) => row);
}

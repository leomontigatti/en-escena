import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { payments, refunds } from "@/db/schema";
import type { MovementKind } from "@/lib/finances/movement-kinds";
import type { PaymentMethod } from "@/lib/finances/payment-methods";

/** One `Movimiento` of the owner's tab: a payment or a refund, never an allocation. */
export type OwnerMovementRow = {
  amount: number;
  date: string;
  id: string;
  internalNote: string | null;
  kind: MovementKind;
  method: PaymentMethod;
  /** The movement's number in its own series: payments and refunds count apart. */
  number: number;
  reference: string | null;
};

/**
 * An owner's payments and refunds in one event, newest first, for the
 * `Movimientos` tab of its finance page. Amounts are positive: the kind tells
 * money in from money out. Two movements of one day keep the order they were
 * recorded in.
 */
export async function readOwnerMovements(input: {
  academyId: string;
  eventId: string;
}): Promise<OwnerMovementRow[]> {
  const [paymentRows, refundRows] = await Promise.all([
    db
      .select({
        amount: payments.amount,
        createdAt: payments.createdAt,
        date: payments.paymentDate,
        id: payments.id,
        internalNote: payments.internalNote,
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
        internalNote: refunds.internalNote,
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

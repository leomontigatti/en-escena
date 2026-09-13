import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { paymentAllocations } from "@/db/schema";

import {
  allocationTargetColumns,
  allocationTargetCondition,
  type AllocationTarget,
} from "./allocation-target.server";
import type { Transaction } from "./choreography-cobro-support.server";

type Executor = Transaction | typeof db;

/**
 * Moves money against an inscription of either kind: adds `delta` to the
 * `(payment, target)` row, creating it if it does not exist and deleting it when
 * the decrement leaves it at zero or less. Uniqueness is settled by the database
 * (the `NULLS NOT DISTINCT` unique constraint over the payment and both target
 * columns), not by a prior read, so two concurrent writes cannot duplicate the
 * row. The positive-amount `CHECK` acts as a net: no row survives at zero.
 */
export async function applyAllocationDelta(
  tx: Executor,
  input: {
    academyId: string;
    delta: number;
    eventId: string;
    paymentId: string;
    target: AllocationTarget;
  },
): Promise<void> {
  if (input.delta === 0) {
    return;
  }

  if (input.delta > 0) {
    await tx
      .insert(paymentAllocations)
      .values({
        academyId: input.academyId,
        amount: input.delta,
        eventId: input.eventId,
        paymentId: input.paymentId,
        ...allocationTargetColumns(input.target),
      })
      .onConflictDoUpdate({
        target: [
          paymentAllocations.paymentId,
          paymentAllocations.choreographyInscriptionId,
          paymentAllocations.seminarInscriptionId,
        ],
        set: {
          amount: sql`${paymentAllocations.amount} + ${input.delta}`,
          updatedAt: new Date(),
        },
      });

    return;
  }

  const existing = await tx.query.paymentAllocations.findFirst({
    where: and(
      eq(paymentAllocations.paymentId, input.paymentId),
      allocationTargetCondition(input.target),
    ),
  });

  if (!existing) {
    return;
  }

  const nextAmount = existing.amount + input.delta;

  if (nextAmount <= 0) {
    await tx
      .delete(paymentAllocations)
      .where(eq(paymentAllocations.id, existing.id));

    return;
  }

  await tx
    .update(paymentAllocations)
    .set({ amount: nextAmount, updatedAt: new Date() })
    .where(eq(paymentAllocations.id, existing.id));
}

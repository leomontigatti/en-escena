import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { paymentAllocations } from "@/db/schema";

import type { Transaction } from "./choreography-cobro-support.server";

type Executor = Transaction | typeof db;

/**
 * Mueve dinero contra una inscripción: suma `delta` a la fila `(pago,
 * inscripción)`, creándola si no existe y borrándola cuando el decremento la
 * deja en cero o menos. La unicidad la resuelve la base (índice único), no una
 * lectura previa, así que dos escrituras concurrentes no pueden duplicar la
 * fila. El `CHECK` de monto positivo hace de red: ninguna fila sobrevive en
 * cero.
 */
export async function applyAllocationDelta(
  tx: Executor,
  input: {
    academyId: string;
    delta: number;
    eventId: string;
    inscriptionId: string;
    paymentId: string;
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
        inscriptionId: input.inscriptionId,
        paymentId: input.paymentId,
      })
      .onConflictDoUpdate({
        target: [
          paymentAllocations.paymentId,
          paymentAllocations.inscriptionId,
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
      eq(paymentAllocations.inscriptionId, input.inscriptionId),
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

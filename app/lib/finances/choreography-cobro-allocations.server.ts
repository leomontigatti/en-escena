import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { choreographyDancers, paymentAllocations } from "@/db/schema";

import {
  clearBalanceSnapshot,
  clearDepositSnapshot,
  type Transaction,
} from "./choreography-cobro-support.server";

type Executor = Transaction | typeof db;

/**
 * Mueve plata contra una inscripción: suma `delta` a la fila `(pago,
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

/**
 * Reconcilia los snapshots de una inscripción contra lo que le quedó asignado:
 * sin plata vuelve a `impaga`, y con menos de lo que cubría el total vuelve a
 * `señada`. Es el puente mientras el estado siga viviendo en columnas
 * congeladas; cuando el estado se derive de `Σ asignaciones` no queda nada que
 * reconciliar. Corre siempre DESPUÉS de borrar las asignaciones: limpiar la seña
 * mueve `selected_price_id`, y el guard de precio de la base lo rechaza mientras
 * la inscripción tenga plata encima.
 */
export async function syncInscriptionSnapshots(
  tx: Executor,
  inscriptionIds: string[],
): Promise<void> {
  if (inscriptionIds.length === 0) {
    return;
  }

  const inscriptions = await tx.query.choreographyDancers.findMany({
    where: inArray(choreographyDancers.id, inscriptionIds),
  });
  const allocations = await tx
    .select({
      amount: paymentAllocations.amount,
      inscriptionId: paymentAllocations.inscriptionId,
    })
    .from(paymentAllocations)
    .where(inArray(paymentAllocations.inscriptionId, inscriptionIds));

  const allocatedByInscription = new Map<string, number>();
  for (const allocation of allocations) {
    allocatedByInscription.set(
      allocation.inscriptionId,
      (allocatedByInscription.get(allocation.inscriptionId) ?? 0) +
        allocation.amount,
    );
  }

  for (const inscription of inscriptions) {
    const allocated = allocatedByInscription.get(inscription.id) ?? 0;
    const depositAmount = inscription.depositAmount ?? 0;
    const coveredTotal = depositAmount + (inscription.balanceAmount ?? 0);

    const patch = {
      ...(inscription.balanceReferenceDate !== null && allocated < coveredTotal
        ? clearBalanceSnapshot()
        : {}),
      ...(inscription.depositReferenceDate !== null && allocated < depositAmount
        ? clearDepositSnapshot()
        : {}),
    };

    if (Object.keys(patch).length === 0) {
      continue;
    }

    await tx
      .update(choreographyDancers)
      .set(patch)
      .where(eq(choreographyDancers.id, inscription.id));
  }
}

/**
 * Devuelve al `Saldo disponible` de la academia todo lo asignado a una
 * inscripción: borra sus asignaciones de pago y limpia sus snapshots. Helper
 * consumido al quitar una inscripción del roster. Acepta una transacción externa
 * para participar del borrado del roster.
 */
export async function releaseInscriptionAllocations(
  input: { inscriptionId: string },
  tx: Executor = db,
): Promise<{ releasedAmount: number }> {
  const allocations = await tx.query.paymentAllocations.findMany({
    where: eq(paymentAllocations.inscriptionId, input.inscriptionId),
  });

  const releasedAmount = allocations.reduce(
    (sum, allocation) => sum + allocation.amount,
    0,
  );

  await tx
    .delete(paymentAllocations)
    .where(eq(paymentAllocations.inscriptionId, input.inscriptionId));

  await tx
    .update(choreographyDancers)
    .set({ ...clearDepositSnapshot(), ...clearBalanceSnapshot() })
    .where(eq(choreographyDancers.id, input.inscriptionId));

  return { releasedAmount };
}

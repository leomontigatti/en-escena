/**
 * The two halves of one invariant: `spreadFromPool` funds an inscription from
 * the academy's `Saldo disponible` and `unwindToPool` unfunds it. They live
 * together because neither can change without the other.
 *
 * ## The invariant
 *
 * ```
 * Saldo disponible = Σ payments − Σ allocations − Σ refunds ≥ 0
 * ```
 *
 * The floor at zero is **structural, not a clamp**: every allocation is capped
 * against what is still free in the payments, and a payment's `amount` is
 * editable only downwards to what it already has allocated — the payment edit
 * form refuses a smaller `amount`, and refuses to move the payment to another
 * academy at all while it holds any allocation
 * (`app/features/admin/payments/detail/server.ts`). There is no subtraction that
 * could overshoot — with no pool, the write is refused before a single row is
 * touched.
 *
 * The refunds term is in the invariant because it is part of the rule, but it
 * **does not exist yet**: there is no refunds table or column, so until #536
 * adds one, `Saldo disponible` reads as `Σ payments − Σ allocations`.
 *
 * ## The two directions
 *
 * Funding consumes the academy's payments **oldest-first by payment number**;
 * unfunding consumes the inscription's allocations **newest-first by payment
 * number**, decrementing and deleting the row at zero. Funding an amount and
 * immediately unfunding it returns the rows to their prior state.
 *
 * The round trip is exact as long as what is unwound is the last thing funded.
 * If money is freed in the meantime on a payment older than one where the
 * inscription already held an allocation, the total comes back the same but may
 * be split differently across payments: money is fungible and no provenance is
 * stored, which is precisely what keeps a reversal order from coming back.
 *
 * ## The accepted cost
 *
 * An administrator can no longer lift **one specific payment** off **one
 * specific inscription**: they name an inscription and an amount, never a
 * payment. Editing the payment is no way around it: an edit moves no
 * allocation, so a changed `amount` lands in `Saldo disponible` and leaves
 * every allocation where it was. Undoing what a payment funded means deleting
 * the payment, which cascades its allocations away.
 */

import { and, asc, desc, eq } from "drizzle-orm";

import { paymentAllocations, payments } from "@/db/schema";
import { deriveInscriptionFinancialFigures } from "@/lib/finances/inscription-financial-status";
import { resolvePaymentAvailableAmount } from "@/lib/finances/payment-available-amount.server";
import { readInscriptionThresholds } from "@/lib/finances/inscription-thresholds.server";

import { applyAllocationDelta } from "./choreography-cobro-allocations.server";
import type {
  CobroResult,
  Executor,
} from "./choreography-cobro-support.server";

/**
 * Money moving in one direction between an inscription and the academy's pool.
 * Both halves of the invariant take exactly this, which is what makes them
 * mirror images at the call site too.
 */
export type PoolMovement = {
  academyId: string;
  amount: number;
  eventId: string;
  inscriptionId: string;
};

/**
 * Funds an inscription with money from the academy's `Saldo disponible`.
 *
 * Consumes the payments oldest-first by payment number, creating or
 * incrementing the `(payment, inscription)` row until the amount is covered.
 * Refuses two things, neither with an override:
 *
 * - **Active over-allocation**: what would end up allocated cannot exceed the
 *   inscription's `Total`. That is why owed is computed here, on the write
 *   path, and not only on read.
 * - **Insufficient pool**: money the academy never paid is never allocated.
 *
 * **Passive** over-allocation — the kind already recorded — is left alone: this
 * function neither corrects nor deletes it, it only refuses to grow it.
 */
export async function spreadFromPool(
  tx: Executor,
  input: PoolMovement,
): Promise<CobroResult> {
  if (input.amount <= 0) {
    return {
      ok: false,
      message: "El monto a asignar tiene que ser mayor a 0.",
    };
  }

  const refusal = await assertNoActiveOverAllocation(tx, input);
  if (!refusal.ok) {
    return refusal;
  }

  const pool = await readPoolAvailability(tx, {
    academyId: input.academyId,
    eventId: input.eventId,
  });
  const availableAmount = pool.reduce(
    (sum, entry) => sum + entry.availableAmount,
    0,
  );

  if (availableAmount < input.amount) {
    return {
      ok: false,
      message: "La academia no tiene saldo disponible suficiente.",
    };
  }

  let remaining = input.amount;

  for (const entry of pool) {
    if (remaining === 0) {
      break;
    }

    const delta = Math.min(remaining, entry.availableAmount);

    if (delta === 0) {
      continue;
    }

    await applyAllocationDelta(tx, {
      academyId: input.academyId,
      delta,
      eventId: input.eventId,
      inscriptionId: input.inscriptionId,
      paymentId: entry.paymentId,
    });

    remaining -= delta;
  }

  return { ok: true };
}

/**
 * Returns money from an inscription to the academy's `Saldo disponible`: the
 * exact inverse of `spreadFromPool`.
 *
 * Consumes the inscription's allocations newest-first by payment number,
 * decrementing and deleting the row when it reaches zero. More than the
 * inscription has allocated cannot be taken; taking it all leaves no rows.
 */
export async function unwindToPool(
  tx: Executor,
  input: PoolMovement,
): Promise<CobroResult> {
  if (input.amount <= 0) {
    return { ok: false, message: "El monto a quitar tiene que ser mayor a 0." };
  }

  const allocations = await readInscriptionAllocations(tx, input.inscriptionId);
  const allocatedAmount = allocations.reduce(
    (sum, allocation) => sum + allocation.amount,
    0,
  );

  if (allocatedAmount < input.amount) {
    return {
      ok: false,
      message: "La inscripción no tiene ese dinero asignado.",
    };
  }

  let remaining = input.amount;

  for (const allocation of allocations) {
    if (remaining === 0) {
      break;
    }

    const delta = Math.min(remaining, allocation.amount);

    await applyAllocationDelta(tx, {
      academyId: input.academyId,
      delta: -delta,
      eventId: input.eventId,
      inscriptionId: input.inscriptionId,
      paymentId: allocation.paymentId,
    });

    remaining -= delta;
  }

  return { ok: true };
}

/**
 * What the inscription has allocated right now. Consumed by the
 * over-allocation check and by the cobro presets, which allocate exactly what
 * is owed.
 */
export async function readInscriptionAllocatedAmount(
  tx: Executor,
  inscriptionId: string,
): Promise<number> {
  const allocations = await readInscriptionAllocations(tx, inscriptionId);

  return allocations.reduce((sum, allocation) => sum + allocation.amount, 0);
}

/**
 * The academy's `Saldo disponible` for an event: what is left free across its
 * payments. The presets read it before writing anything, so a shortfall is
 * refused whole instead of halfway through a choreography.
 */
export async function readAcademyAvailableBalance(
  tx: Executor,
  input: { academyId: string; eventId: string },
): Promise<number> {
  const pool = await readPoolAvailability(tx, input);

  return pool.reduce((sum, entry) => sum + entry.availableAmount, 0);
}

/**
 * Refusal of active over-allocation. Computes owed on the write path through
 * the same owner the read path uses (`deriveInscriptionFinancialFigures` over
 * the resolved thresholds), so a write cannot disagree with what the screen
 * shows.
 */
async function assertNoActiveOverAllocation(
  tx: Executor,
  input: PoolMovement,
): Promise<CobroResult> {
  const thresholds = await readInscriptionThresholds(tx, {
    academyId: input.academyId,
    eventId: input.eventId,
    inscriptionIds: [input.inscriptionId],
  });
  const inscriptionThresholds = thresholds.get(input.inscriptionId);

  if (!inscriptionThresholds) {
    return { ok: false, message: "No encontramos esa inscripción." };
  }

  const figures = deriveInscriptionFinancialFigures({
    allocatedAmount: await readInscriptionAllocatedAmount(
      tx,
      input.inscriptionId,
    ),
    thresholds: inscriptionThresholds,
  });

  if (figures.owedBalanceAmount === null) {
    return {
      ok: false,
      message:
        "No hay un precio configurado para esta inscripción, así que no se puede saber cuánto debe.",
    };
  }

  if (input.amount > figures.owedBalanceAmount) {
    return {
      ok: false,
      message: "No se puede asignar más de lo que la inscripción adeuda.",
    };
  }

  return { ok: true };
}

/**
 * The academy's payments in the event with what is still free on each, oldest
 * first by payment number. This is the pool: the sum of these is the academy's
 * `Saldo disponible`, and the per-payment split is what funding walks.
 */
async function readPoolAvailability(
  tx: Executor,
  input: { academyId: string; eventId: string },
): Promise<Array<{ availableAmount: number; paymentId: string }>> {
  const paymentRows = await tx
    .select({
      amount: payments.amount,
      id: payments.id,
    })
    .from(payments)
    .where(
      and(
        eq(payments.academyId, input.academyId),
        eq(payments.eventId, input.eventId),
      ),
    )
    .orderBy(asc(payments.paymentNumber));

  const allocationRows = await tx
    .select({
      amount: paymentAllocations.amount,
      paymentId: paymentAllocations.paymentId,
    })
    .from(paymentAllocations)
    .where(
      and(
        eq(paymentAllocations.academyId, input.academyId),
        eq(paymentAllocations.eventId, input.eventId),
      ),
    );

  const allocatedByPayment = new Map<string, number>();
  for (const allocation of allocationRows) {
    allocatedByPayment.set(
      allocation.paymentId,
      (allocatedByPayment.get(allocation.paymentId) ?? 0) + allocation.amount,
    );
  }

  return paymentRows.map((payment) => ({
    availableAmount: resolvePaymentAvailableAmount({
      allocatedAmount: allocatedByPayment.get(payment.id) ?? 0,
      amount: payment.amount,
    }),
    paymentId: payment.id,
  }));
}

/**
 * An inscription's allocations, newest first by payment number: the order in
 * which they are undone.
 */
async function readInscriptionAllocations(
  tx: Executor,
  inscriptionId: string,
): Promise<Array<{ amount: number; paymentId: string }>> {
  return await tx
    .select({
      amount: paymentAllocations.amount,
      paymentId: paymentAllocations.paymentId,
    })
    .from(paymentAllocations)
    .innerJoin(payments, eq(paymentAllocations.paymentId, payments.id))
    .where(eq(paymentAllocations.inscriptionId, inscriptionId))
    .orderBy(desc(payments.paymentNumber));
}

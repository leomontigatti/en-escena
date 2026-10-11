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
 *
 * ## The pool lock
 *
 * Checking the floor is a read followed by a write over rows nobody locks, so
 * two writes for one academy in one event could each read the same free money
 * and each allocate it: two presets over different seminars, a preset and a
 * single-inscription allocation, a spread and a payment edit. `lockAcademyPool`
 * serialises every write that moves the academy's pool, per `(academy, event)`,
 * and the write that comes second reads what the first one left.
 *
 * Both halves take it **after** the seminar and inscription locks their callers
 * already hold, never before one of them, so it adds no lock order to deadlock
 * on. The payment edit and deletion take it first, holding nothing yet; the
 * academy merge takes it before its academy lock, and touches none of the rows
 * a spread locks ahead of the pool.
 */

import { and, asc, desc, eq, sql } from "drizzle-orm";

import { choreographyDancers, paymentAllocations, payments } from "@/db/schema";
import { deriveInscriptionFinancialFigures } from "@/lib/finances/inscription-financial-status";
import { resolvePaymentAvailableAmount } from "@/lib/finances/payment-available-amount.server";
import { readInscriptionThresholds } from "@/lib/finances/inscription-thresholds.server";
import { readSeminarInscriptionThresholds } from "@/lib/finances/seminar-inscription-thresholds.server";
import type { InscriptionThresholds } from "@/lib/finances/inscription-financial-status";

import {
  allocationTargetCondition,
  type AllocationTarget,
  type AllocationTargetKind,
} from "./allocation-target.server";
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
  target: AllocationTarget;
};

/**
 * A refusal that belongs to the kind of target rather than to the pool: the
 * seminar's quota is the only one so far, and it has to be read between the two
 * refusals `spreadFromPool` owns. The order is the PRD's — missing price,
 * over-allocation, **this**, insufficient pool — and it lives here so no caller
 * can put it somewhere else. It runs with what the over-allocation check
 * already read, so the guard does not query the same figures again.
 */
export type PoolTargetGuard = (input: {
  allocatedAmount: number;
  amount: number;
}) => Promise<CobroResult>;

export type PoolSpread = PoolMovement & { targetGuard?: PoolTargetGuard };

/**
 * How a kind of inscription answers "what does this row owe?". The two halves
 * of the invariant stay single functions, and the only thing that varies with
 * the target's kind is this read — chosen inside the module, so no caller has
 * to know which reader belongs to which kind.
 */
type ThresholdReader = (
  executor: Executor,
  input: { academyId: string; eventId: string; inscriptionIds: string[] },
) => Promise<Map<string, InscriptionThresholds>>;

const thresholdReaders: Record<AllocationTargetKind, ThresholdReader> = {
  choreography: readInscriptionThresholds,
  seminar: readSeminarInscriptionThresholds,
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
 * A `targetGuard` adds the refusal the kind of target owns — today the seminar's
 * quota — and is read **between** those two, which is the order the PRD fixes.
 *
 * **Passive** over-allocation — the kind already recorded — is left alone: this
 * function neither corrects nor deletes it, it only refuses to grow it.
 */
export async function spreadFromPool(
  tx: Executor,
  input: PoolSpread,
): Promise<CobroResult> {
  if (input.amount <= 0) {
    return {
      ok: false,
      message: "El monto a asignar tiene que ser mayor a 0.",
    };
  }

  const overAllocation = await assertNoActiveOverAllocation(tx, input);
  if (!overAllocation.ok) {
    return overAllocation;
  }

  if (input.targetGuard) {
    const refusal = await input.targetGuard({
      allocatedAmount: overAllocation.allocatedAmount,
      amount: input.amount,
    });

    if (!refusal.ok) {
      return refusal;
    }
  }

  const poolKey = { academyId: input.academyId, eventId: input.eventId };
  await lockAcademyPool(tx, poolKey);
  const pool = await readPoolAvailability(tx, poolKey);
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
      paymentId: entry.paymentId,
      target: input.target,
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

  await lockAcademyPool(tx, {
    academyId: input.academyId,
    eventId: input.eventId,
  });
  const allocations = await readInscriptionAllocations(tx, input.target);
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
      paymentId: allocation.paymentId,
      target: input.target,
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
  target: AllocationTarget,
): Promise<number> {
  const allocations = await readInscriptionAllocations(tx, target);

  return allocations.reduce((sum, allocation) => sum + allocation.amount, 0);
}

/**
 * The academy's `Saldo disponible` for an event: what is left free across its
 * payments. The presets read it before writing anything, so a shortfall is
 * refused whole instead of halfway through a choreography.
 *
 * It is **target-agnostic** on purpose: an allocation row carries `academyId`
 * and `eventId` whichever kind of inscription it points at, so the pool one
 * academy draws on is one pool and not one per kind.
 */
export async function readAcademyAvailableBalance(
  tx: Executor,
  input: { academyId: string; eventId: string },
): Promise<number> {
  const pool = await readPoolAvailability(tx, input);

  return pool.reduce((sum, entry) => sum + entry.availableAmount, 0);
}

/** One academy's pool in one event: what `lockAcademyPool` serialises on. */
type AcademyPool = { academyId: string; eventId: string };

/**
 * Serialises the writes that move one academy's pool in one event; see "The
 * pool lock" above. Call it before reading what the pool has free.
 *
 * The lock is transaction-scoped: released by the commit or the rollback, and
 * re-entrant, so a preset that spreads many times takes it once and waits for
 * nobody the second time. Called outside a transaction it is released as soon
 * as it is taken, which is why every write reaches it through one.
 *
 * `hashtext` collapses the key into the `bigint` the lock function takes. A
 * collision between two pools costs one of them a wait, never correctness.
 */
async function lockAcademyPool(tx: Executor, pool: AcademyPool): Promise<void> {
  await lockAcademyPools(tx, [pool]);
}

/**
 * The pool lock over several pools at once, taken in key order so two writers
 * that need overlapping sets cannot each hold one the other waits on.
 */
export async function lockAcademyPools(
  tx: Executor,
  pools: readonly AcademyPool[],
): Promise<void> {
  const keys = [...new Set(pools.map(academyPoolLockKey))].sort();

  for (const key of keys) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
  }
}

/**
 * Takes the lock on the pool a payment belongs to and answers that pool. For
 * the payment edit and deletion, which check that a payment still covers what
 * is allocated to it.
 *
 * The payment is read again once the lock is held, because a concurrent edit
 * may have moved it to another academy while this one waited. That answers
 * `moved`, and the caller refuses: locking the new pool too would hold two pool
 * locks taken in move order, which deadlocks against a writer that takes them
 * sorted (`lockAcademyPools`, the academy merge). The lock is
 * transaction-scoped and cannot be released early, so there is no retrying
 * inside the transaction either.
 */
export async function lockPaymentPool(
  tx: Executor,
  paymentId: string,
): Promise<
  | { status: "locked"; pool: AcademyPool }
  | { status: "missing" }
  | { status: "moved" }
> {
  const read = await readPaymentPool(tx, paymentId);

  if (!read) {
    return { status: "missing" };
  }

  await lockAcademyPool(tx, read);

  const locked = await readPaymentPool(tx, paymentId);

  if (!locked) {
    return { status: "missing" };
  }

  return academyPoolLockKey(locked) === academyPoolLockKey(read)
    ? { status: "locked", pool: locked }
    : { status: "moved" };
}

async function readPaymentPool(
  tx: Executor,
  paymentId: string,
): Promise<AcademyPool | undefined> {
  const [payment] = await tx
    .select({ academyId: payments.academyId, eventId: payments.eventId })
    .from(payments)
    .where(eq(payments.id, paymentId));

  return payment;
}

function academyPoolLockKey(pool: AcademyPool): string {
  return `academy-pool:${pool.academyId}:${pool.eventId}`;
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
): Promise<
  { ok: false; message: string } | { ok: true; allocatedAmount: number }
> {
  if (input.target.kind === "choreography") {
    // The lock the waiver takes (`inscription-waiver.server.ts`), taken before
    // the row is read: an allocation and a waiver racing for one inscription
    // are serialized, and whichever comes second sees the other's write.
    await tx
      .select({ id: choreographyDancers.id })
      .from(choreographyDancers)
      .where(eq(choreographyDancers.id, input.target.id))
      .for("update");
  }

  const thresholds = await thresholdReaders[input.target.kind](tx, {
    academyId: input.academyId,
    eventId: input.eventId,
    inscriptionIds: [input.target.id],
  });
  const inscriptionThresholds = thresholds.get(input.target.id);

  if (!inscriptionThresholds) {
    return { ok: false, message: "No encontramos esa inscripción." };
  }

  if (inscriptionThresholds.waived) {
    return {
      ok: false,
      message:
        "Esta inscripción está bonificada: no se le puede asignar dinero. Para cobrarla, quitá la bonificación.",
    };
  }

  const allocatedAmount = await readInscriptionAllocatedAmount(
    tx,
    input.target,
  );
  const figures = deriveInscriptionFinancialFigures({
    allocatedAmount,
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

  return { ok: true, allocatedAmount };
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
  target: AllocationTarget,
): Promise<Array<{ amount: number; paymentId: string }>> {
  return await tx
    .select({
      amount: paymentAllocations.amount,
      paymentId: paymentAllocations.paymentId,
    })
    .from(paymentAllocations)
    .innerJoin(payments, eq(paymentAllocations.paymentId, payments.id))
    .where(allocationTargetCondition(target))
    .orderBy(desc(payments.paymentNumber));
}

/**
 * The one owner of an owner's `Saldo disponible` (`availableBalanceAmount`) and
 * of each payment's `Disponible` (`paymentAvailableAmount`). Every summary, the
 * funding cap of the pool, and the payment edit guard read them from here, so
 * no screen and no write can disagree about how much money is free.
 *
 * ```
 * Saldo disponible = Σ payments − Σ allocations − Σ refunds
 * ```
 *
 * A payment's **free money** is its amount minus what its own allocations
 * commit. Refunds name no payment, so they are read as drawing on that free
 * money **newest payment number first**, never more from a payment than it has
 * free. A payment's `Disponible` is its free money minus the refund it carries,
 * and the payments' figures sum to `Saldo disponible`. Nothing of the split is
 * stored: it is derived on every read (`splitAvailableBalance`).
 *
 * **It carries no provenance.** An allocation names an inscription and an
 * amount, never a payment, and unwinding one can return the money on a
 * different payment than it left. So a `Disponible` reads as "how much of this
 * payment is still free to draw", never as "this payment is unresolved".
 *
 * Free money is floored at zero rather than trusted to be non-negative. It
 * cannot go negative —an allocation is capped against the pool and a payment's
 * amount cannot be edited below what it already funds— so the floor is a guard
 * and not a calculation.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { alias, type AnyPgColumn } from "drizzle-orm/pg-core";

import { paymentAllocations, payments, refunds } from "@/db/schema";

import type { Executor } from "./choreography-cobro-support.server";

/** What the split needs of one payment of the pool. */
export type PoolPayment = {
  allocatedAmount: number;
  amount: number;
  paymentId: string;
  paymentNumber: number;
};

export type PaymentAvailability = PoolPayment & {
  paymentAvailableAmount: number;
};

export type AvailableBalance = {
  availableBalanceAmount: number;
  /** Oldest first by payment number: the order funding draws in. */
  payments: PaymentAvailability[];
};

/** One owner's pool in one event. */
export type OwnerPool = { academyId: string; eventId: string };

/** What the split reads of one owner's pool. */
export type PoolBalanceInputs = {
  payments: PoolPayment[];
  refundedAmount: number;
};

/**
 * Each payment's `Disponible` and the owner's `Saldo disponible`, from the
 * payments with their own allocations and the owner's refunds total.
 */
export function splitAvailableBalance(input: {
  payments: readonly PoolPayment[];
  refundedAmount: number;
}): AvailableBalance {
  const newestFirst = [...input.payments].sort(
    (left, right) => right.paymentNumber - left.paymentNumber,
  );
  let undrawnRefund = input.refundedAmount;
  const split: PaymentAvailability[] = [];

  for (const payment of newestFirst) {
    const freeAmount = Math.max(payment.amount - payment.allocatedAmount, 0);
    const refundShare = Math.min(freeAmount, undrawnRefund);

    undrawnRefund -= refundShare;
    split.push({
      ...payment,
      paymentAvailableAmount: freeAmount - refundShare,
    });
  }

  split.reverse();

  return {
    availableBalanceAmount: split.reduce(
      (sum, payment) => sum + payment.paymentAvailableAmount,
      0,
    ),
    payments: split,
  };
}

/**
 * Whether a change to one payment would leave the owner's refunds with less
 * money than they took out: the pool floor of the payment edit and deletion.
 * `nextAmount: null` is a payment leaving the pool, deleted (its allocations go
 * with it) or moved to another owner (only possible with none).
 *
 * It reads `Σ payments − Σ allocations − Σ refunds` unfloored, from the split's
 * inputs: the floored `Saldo disponible` cannot go below zero, so it cannot
 * tell. A change that does not lower the payment is never refused, and with no
 * refunds nothing is.
 */
export function paymentChangeUncoversRefunds(
  pool: PoolBalanceInputs,
  change: { nextAmount: number | null; paymentId: string },
): boolean {
  const changed = pool.payments.find(
    (payment) => payment.paymentId === change.paymentId,
  );

  if (
    pool.refundedAmount === 0 ||
    !changed ||
    (change.nextAmount !== null && change.nextAmount >= changed.amount)
  ) {
    return false;
  }

  const remainingAmount = pool.payments.reduce((sum, payment) => {
    if (payment !== changed) {
      return sum + payment.amount - payment.allocatedAmount;
    }

    return change.nextAmount === null
      ? sum
      : sum + change.nextAmount - payment.allocatedAmount;
  }, 0);

  return remainingAmount < pool.refundedAmount;
}

/**
 * The split of several owners in one event, in one read. An owner with no
 * payment reads an empty pool. It takes the caller's executor, so a write that
 * holds the pool lock reads what the lock protects.
 */
export async function readAvailableBalances(
  executor: Executor,
  input: { academyIds: readonly string[]; eventId: string },
): Promise<Map<string, AvailableBalance>> {
  const balances = new Map<string, AvailableBalance>();

  for (const [academyId, pool] of await readPoolBalanceInputsByOwner(
    executor,
    input,
  )) {
    balances.set(academyId, splitAvailableBalance(pool));
  }

  return balances;
}

/** The split's inputs of one owner's pool, under the caller's executor. */
export async function readPoolBalanceInputs(
  executor: Executor,
  pool: OwnerPool,
): Promise<PoolBalanceInputs> {
  const inputs = await readPoolBalanceInputsByOwner(executor, {
    academyIds: [pool.academyId],
    eventId: pool.eventId,
  });

  return inputs.get(pool.academyId) ?? { payments: [], refundedAmount: 0 };
}

async function readPoolBalanceInputsByOwner(
  executor: Executor,
  input: { academyIds: readonly string[]; eventId: string },
): Promise<Map<string, PoolBalanceInputs>> {
  const academyIds = [...new Set(input.academyIds)];
  const pools = new Map<string, PoolBalanceInputs>();

  if (academyIds.length === 0) {
    return pools;
  }

  const [paymentRows, allocationRows, refundRows] = await Promise.all([
    executor
      .select({
        academyId: payments.academyId,
        amount: payments.amount,
        paymentId: payments.id,
        paymentNumber: payments.paymentNumber,
      })
      .from(payments)
      .where(
        and(
          eq(payments.eventId, input.eventId),
          inArray(payments.academyId, academyIds),
        ),
      ),
    // Every allocation of the event, whichever kind of inscription it sits on:
    // an owner draws on one pool, not one per kind.
    executor
      .select({
        amount: paymentAllocations.amount,
        paymentId: paymentAllocations.paymentId,
      })
      .from(paymentAllocations)
      .where(
        and(
          eq(paymentAllocations.eventId, input.eventId),
          inArray(paymentAllocations.academyId, academyIds),
        ),
      ),
    executor
      .select({ academyId: refunds.academyId, amount: refunds.amount })
      .from(refunds)
      .where(
        and(
          eq(refunds.eventId, input.eventId),
          inArray(refunds.academyId, academyIds),
        ),
      ),
  ]);

  const refundedByAcademy = sumAmountsBy(refundRows, (row) => row.academyId);
  const allocatedByPayment = sumAmountsBy(
    allocationRows,
    (row) => row.paymentId,
  );
  const paymentsByAcademy = new Map<string, PoolPayment[]>(
    academyIds.map((academyId) => [academyId, []]),
  );
  for (const { academyId, ...payment } of paymentRows) {
    paymentsByAcademy.get(academyId)?.push({
      ...payment,
      allocatedAmount: allocatedByPayment.get(payment.paymentId) ?? 0,
    });
  }

  for (const [academyId, poolPayments] of paymentsByAcademy) {
    pools.set(academyId, {
      payments: poolPayments,
      refundedAmount: refundedByAcademy.get(academyId) ?? 0,
    });
  }

  return pools;
}

function sumAmountsBy<Row extends { amount: number }>(
  rows: readonly Row[],
  keyOf: (row: Row) => string,
): Map<string, number> {
  const sums = new Map<string, number>();

  for (const row of rows) {
    sums.set(keyOf(row), (sums.get(keyOf(row)) ?? 0) + row.amount);
  }

  return sums;
}

/** The split of one owner's pool in one event. */
export async function readAvailableBalance(
  executor: Executor,
  pool: OwnerPool,
): Promise<AvailableBalance> {
  const balances = await readAvailableBalances(executor, {
    academyIds: [pool.academyId],
    eventId: pool.eventId,
  });

  return balances.get(pool.academyId) ?? emptyAvailableBalance();
}

/** The owner's `Saldo disponible` alone. */
export async function readAcademyAvailableBalance(
  executor: Executor,
  pool: OwnerPool,
): Promise<number> {
  const balance = await readAvailableBalance(executor, pool);

  return balance.availableBalanceAmount;
}

function emptyAvailableBalance(): AvailableBalance {
  return { availableBalanceAmount: 0, payments: [] };
}

/**
 * The SQL form of a payment's `Disponible`, for the event-wide payments list,
 * which filters, sums and paginates on it in the database. It is
 * `splitAvailableBalance` row by row: the payment's free money, less the share
 * of the owner's refunds that the newer payments' free money did not absorb.
 * The module's DB test pins the two forms to the same figures.
 *
 * The figure is wrapped in a second template on purpose: Drizzle leaves the
 * columns of a select field unqualified when the query has a single table, and
 * an unqualified `id` inside a subquery would resolve to the subquery's own
 * table. Columns of a nested template are always qualified.
 */
function freeAmountSql(payment: { amount: AnyPgColumn; id: AnyPgColumn }) {
  return sql`greatest(${payment.amount} - coalesce((select sum(${paymentAllocations.amount}) from ${paymentAllocations} where ${paymentAllocations.paymentId} = ${payment.id}), 0), 0)`;
}

// Inside a template an alias renders as its bare name, so the subquery's
// `from` names the table and the alias itself.
const newerPaymentsAlias = "newer_payment";
const newerPayments = alias(payments, newerPaymentsAlias);

const paymentFreeAmountSql = freeAmountSql(payments);

const newerPaymentsFreeAmountSql = sql`coalesce((select sum(${freeAmountSql(newerPayments)}) from ${payments} as ${sql.identifier(newerPaymentsAlias)} where ${newerPayments.eventId} = ${payments.eventId} and ${newerPayments.academyId} = ${payments.academyId} and ${newerPayments.paymentNumber} > ${payments.paymentNumber}), 0)`;

const ownerRefundedAmountSql = sql`coalesce((select sum(${refunds.amount}) from ${refunds} where ${refunds.eventId} = ${payments.eventId} and ${refunds.academyId} = ${payments.academyId}), 0)`;

export const paymentAvailableAmountSql = sql<number>`${paymentFreeAmountSql} - least(${paymentFreeAmountSql}, greatest(${ownerRefundedAmountSql} - ${newerPaymentsFreeAmountSql}, 0))`;

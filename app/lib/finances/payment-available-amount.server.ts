import { sql } from "drizzle-orm";

import { paymentAllocations, payments } from "@/db/schema";

/**
 * What is still free on **one payment**: its amount minus what its own
 * allocations already commit.
 *
 * It is the per-payment cut of `availableBalanceAmount` ("Saldo disponible"),
 * which the glossary defines at academy scope as `paid − allocated − refunded`.
 * This is the definition of that figure and not a second copy of it: the
 * allocation pool draws through `resolvePaymentAvailableAmount` too
 * (`readPoolAvailability`, oldest payment first), so what the list shows as free
 * on a payment is what the pool would actually take from it.
 *
 * **It carries no provenance.** Money is fungible here: an allocation names an
 * inscription and an amount, never a payment, and unwinding one can return the
 * money on a different payment than it left. So this reads as "how much of this
 * payment is still free to draw", never as "this payment is unresolved" — the
 * money arrived in full either way.
 *
 * Floored at zero rather than trusted to be non-negative. It cannot go negative
 * today —an allocation is capped against the pool and a payment's amount cannot
 * be edited below what it already funds— so the floor is a guard and not a
 * calculation.
 *
 * The refunds term of the invariant is missing because refunds do not exist yet
 * (#536): they never carry allocations, so when they land they subtract from the
 * academy's pool and not from any one payment, and this figure is where that
 * question has to be asked again.
 */
export const paymentAvailableAmountSql = sql<number>`greatest(${payments.amount} - coalesce((select sum(${paymentAllocations.amount}) from ${paymentAllocations} where ${paymentAllocations.paymentId} = ${payments.id}), 0), 0)`;

/** The same figure from an already-summed allocated total, for a single payment. */
export function resolvePaymentAvailableAmount(input: {
  allocatedAmount: number;
  amount: number;
}) {
  return Math.max(input.amount - input.allocatedAmount, 0);
}

/**
 * THROWAWAY PROTOTYPE — ticket #550 of map #547.
 *
 * The write-path rules the earlier passes left out. Everything above this module
 * is a *reading* — money against a figure — but two of #550's questions are about
 * what the surface refuses to write, and a surface cannot be judged on that
 * without the refusal being real.
 *
 * Three rules live here:
 *
 * 1. **Active over-allocation is rejected** (#549), with the message naming the
 *    remaining owed. Passive excess — a discount that improved after the money
 *    landed — is untouched: an inscription already over-allocated can still be
 *    *reduced*, it just cannot be pushed further up.
 * 2. **A payment cannot be over-drawn.** Not a decision, a fact; the prototype
 *    used to let an amount exceed the payment's balance without saying so.
 * 3. **The price is fixed by the first allocation.** Three candidate policies
 *    were prototyped behind a switch; `blocked` won, so only it survives here.
 */
import { formatAmount } from "../formatters";
import type { InscriptionReading, PaymentReading } from "./fixtures";

export type AllocationRejection = {
  reason: "overAllocation" | "paymentOverdrawn";
  message: string;
};

/**
 * `amount` is absolute: it replaces whatever this inscription already holds of
 * this payment (the upsert #549 settled), so both checks work off the delta.
 */
export function rejectAllocation({
  inscription,
  payment,
  amount,
}: {
  inscription: InscriptionReading;
  payment: PaymentReading;
  amount: number;
}): AllocationRejection | null {
  const existing =
    inscription.allocations.find(
      (allocation) => allocation.paymentId === payment.id,
    )?.amount ?? 0;
  const delta = amount - existing;

  if (delta > payment.availableAmount) {
    return {
      reason: "paymentOverdrawn",
      message: `El pago #${payment.number} tiene ${formatAmount(payment.availableAmount + existing)} para esta inscripción.`,
    };
  }

  const nextAllocated = inscription.allocatedAmount + delta;

  // Only a *rise* past the total is rejected. An inscription whose discount
  // improved after the fact is already above its total, and blocking it here
  // would make its money impossible to move.
  if (
    inscription.totalAmount !== null &&
    nextAllocated > inscription.totalAmount &&
    delta > 0
  ) {
    return {
      reason: "overAllocation",
      message:
        inscription.owedBalanceAmount === 0
          ? `${inscription.dancerName} ya está saldada: no admite más plata.`
          : `${inscription.dancerName} adeuda ${formatAmount(inscription.owedBalanceAmount ?? 0)}; no se puede asignar de más.`,
    };
  }

  return null;
}

/**
 * **The price is fixed by the first allocation.** Settled on reacting to the
 * prototype, out of the three policies it offered (`free`, `warn`, `blocked`).
 *
 * The reason `blocked` wins is that #549 already built its exit: an inscription
 * that runs out of allocations clears `selectedPriceId` on its own, so
 * "change this dancer's price" has a defined gesture — take the money off, pick
 * again — instead of silently moving the seña and the total under money that is
 * already placed. It is also the only policy under which that mirror rule is
 * load-bearing rather than trivia.
 *
 * The cost, accepted: the gesture runs through deallocation, which is #553's,
 * and does not exist yet.
 */
export type PriceLockReading = {
  /** No money on the inscription yet: the price is still the admin's to pick. */
  isFirstPick: boolean;
  isLocked: boolean;
  /** Why the picker is not offered. Null while the price is still free. */
  lockedReason: string | null;
};

export function readPriceLock(
  inscription: InscriptionReading,
): PriceLockReading {
  if (inscription.allocatedAmount === 0) {
    return { isFirstPick: true, isLocked: false, lockedReason: null };
  }

  return {
    isFirstPick: false,
    isLocked: true,
    lockedReason: `Tiene ${formatAmount(inscription.allocatedAmount)} asignados. Para cambiarle el precio hay que sacarle toda la plata: al quedarse sin asignaciones el precio se limpia solo.`,
  };
}

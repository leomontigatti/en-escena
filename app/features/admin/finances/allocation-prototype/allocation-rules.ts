/**
 * THROWAWAY PROTOTYPE — ticket #550 of map #547.
 *
 * The write-path rules. Everything above this module is a *reading* — money
 * against a figure — but part of #550 is about what the surface refuses to
 * write, and a surface cannot be judged on that without the refusal being real.
 *
 * The rules, all settled on reacting to the prototype:
 *
 * 1. **The admin allocates from `Saldo disponible`, never from a payment.** The
 *    payment is chosen by the fill rule, not by a person — see `spreadFromPool`.
 * 2. **Active over-allocation is rejected** (#549), with the message naming the
 *    remaining owed. Passive excess — a discount that improved after the money
 *    landed — is untouched: an inscription already over-allocated can still be
 *    *reduced*, it just cannot be pushed further up.
 * 3. **The price is fixed by the first allocation.**
 */
import { formatAmount } from "../formatters";
import type {
  InscriptionReading,
  PaymentReading,
  PrototypeAllocation,
} from "./fixtures";

export type AllocationRejection = {
  reason: "overAllocation" | "insufficientBalance" | "notPositive";
  message: string;
};

/**
 * **The payment is not the admin's to choose.** Nothing in the settled model
 * reads the payment→inscription link: map decision 3 removed reference-date
 * derivation, so the price no longer comes from a payment's date; decision 5
 * dropped `allocation_type` because money is fungible; and #548 established
 * that a factura documents the *operación*, not the payment, with decision 9
 * confirming the ARCA payload carries no payment reference. Asking an admin to
 * pick one is asking them to author a fact no derivation consumes.
 *
 * So the money is drawn from the academy's `Saldo disponible` and spread over
 * payments **oldest first, by `paymentNumber`** — never by click order, never
 * by size. The map's standing preference makes the order non-negotiable; oldest
 * first is chosen because it is the one order a human would reconstruct
 * unprompted.
 *
 * Accepted cost: what a payment covered becomes system-authored, so
 * `PaymentCoverage` is a derived audit view rather than a record of decisions.
 */
export function spreadFromPool(
  payments: PaymentReading[],
  amount: number,
): { paymentId: string; paymentNumber: number; amount: number }[] {
  const slices: { paymentId: string; paymentNumber: number; amount: number }[] =
    [];
  let pending = amount;

  for (const payment of [...payments].sort(
    (left, right) => left.number - right.number,
  )) {
    if (pending === 0) {
      break;
    }

    const taken = Math.min(pending, payment.availableAmount);

    if (taken > 0) {
      slices.push({
        paymentId: payment.id,
        paymentNumber: payment.number,
        amount: taken,
      });
      pending -= taken;
    }
  }

  return slices;
}

/**
 * `spreadFromPool`'s counterpart, in the same module because the two are the
 * halves of one invariant: `Saldo disponible = totalPaid − Σ asignaciones`,
 * never negative, whichever way the money moves (#553).
 *
 * Allocation consumes payments **oldest first**; deallocation unwinds them
 * **newest first**, decrementing and deleting at zero. The admin names an
 * inscription and an amount and never a payment — the accepted cost being that
 * one specific payment can no longer be lifted off one inscription. If a payment
 * was recorded in error, the remedy is deleting the payment, whose money leaves
 * the pool entirely rather than returning to it.
 */
export function unwindToPool(
  allocations: PrototypeAllocation[],
  payments: PaymentReading[],
  amount: number,
): PrototypeAllocation[] {
  const numberOf = (paymentId: string) =>
    payments.find((payment) => payment.id === paymentId)?.number ?? 0;
  const next: PrototypeAllocation[] = [];
  let pending = amount;

  for (const allocation of [...allocations].sort(
    (left, right) => numberOf(right.paymentId) - numberOf(left.paymentId),
  )) {
    const taken = Math.min(pending, allocation.amount);
    pending -= taken;
    next.push({ ...allocation, amount: allocation.amount - taken });
  }

  return next;
}

/**
 * `amount` is what the admin wants to draw from `Saldo disponible` and put on
 * this inscription — a **delta**, not a new total.
 */
export function rejectAllocation({
  inscription,
  availableBalanceAmount,
  amount,
}: {
  inscription: InscriptionReading;
  availableBalanceAmount: number;
  amount: number;
}): AllocationRejection | null {
  if (amount <= 0) {
    return {
      reason: "notPositive",
      message: "El monto a asignar tiene que ser mayor que cero.",
    };
  }

  if (amount > availableBalanceAmount) {
    return {
      reason: "insufficientBalance",
      message: `El saldo disponible de la academia es ${formatAmount(availableBalanceAmount)}.`,
    };
  }

  // Only a *rise* past the total is rejected. An inscription whose discount
  // improved after the fact is already above its total, and blocking it here
  // would make its money impossible to move.
  if (inscription.allocatedAmount + amount > inscription.totalAmount) {
    return {
      reason: "overAllocation",
      message:
        inscription.owedBalanceAmount === 0
          ? `${inscription.dancerName} ya está saldada: no admite más plata.`
          : `${inscription.dancerName} adeuda ${formatAmount(inscription.owedBalanceAmount)}; no se puede asignar de más.`,
    };
  }

  return null;
}

/**
 * **The price is fixed by the first allocation.** Settled on reacting to the
 * prototype, out of the three policies it offered (`free`, `warn`, `blocked`).
 *
 * The reason `blocked` wins is that it has an exit: "change this dancer's price"
 * has a defined gesture — take the money off, pick again — instead of silently
 * moving the seña and the total under money that is already placed.
 *
 * **The lock is keyed on money, not on the reference** (#553, amending #549):
 * it releases the instant the last allocation leaves, and `selectedPriceId`
 * keeps its last value rather than reverting to anything. What price the
 * inscription *should* hold afterwards is not a deallocation question — it
 * re-resolves on the next allocation write — and belongs to #583.
 */
/**
 * Which of the money dialogs an inscription opens. It lives here rather than in
 * the component because it is a **decision about what an admin may do to a row**,
 * not a rendering detail: on a row whose money is leaving there is no price to
 * pick and no amount to type, and on a row still being paid there is nothing to
 * release.
 */
export type MoneyDialogShape = "releaseExcess" | "releaseAll" | "allocate";

export function readMoneyDialogShape(
  inscription: InscriptionReading,
): MoneyDialogShape {
  // The excess outranks the status: an over-allocated row is `Pagada` too, and
  // the only sane act on it is getting the surplus off.
  if (inscription.excessAmount > 0) {
    return "releaseExcess";
  }

  // `paidInFull` with nothing on it is a real row, not a contradiction: a total
  // of zero is reached by owing zero. There is nothing to remove, so the
  // removal dialog would offer «Quitar $ 0».
  return inscription.status === "paidInFull" && inscription.allocatedAmount > 0
    ? "releaseAll"
    : "allocate";
}

/**
 * What the amount field hints at: **the figure that finishes the next thing** —
 * the seña while the threshold is unmet, the remaining balance once it is met.
 * A placeholder rather than a default, because the figure moves: the discount is
 * live, so a sibling registering elsewhere changes it while the dialog is open.
 */
export function readSuggestedAmount(inscription: InscriptionReading) {
  return inscription.status === "depositMet"
    ? inscription.owedBalanceAmount
    : inscription.owedDepositAmount;
}

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
    lockedReason: `Tiene ${formatAmount(inscription.allocatedAmount)} asignados. Para cambiarle el precio hay que quitarle toda la plata.`,
  };
}

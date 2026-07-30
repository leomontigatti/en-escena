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
 * 3. **Re-picking the price once money has landed** — the one genuinely open
 *    question of the three. It is a *policy* rather than a rule, so all three
 *    candidate answers are implemented and the prototype toggles between them.
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
 * What happens when an admin re-picks the price of an inscription that already
 * has money on it. Open question — the three candidates are all here so the
 * difference can be felt rather than argued.
 *
 * - `free`: the picker is always editable. Cheapest, and what every variant did
 *   before this pass; the figures move under money that is already placed.
 * - `warn`: editable, but the consequence is spelled out first.
 * - `blocked`: the price is fixed by the first allocation. The escape hatch is
 *   the mirror rule #549 already settled — remove every allocation and
 *   `selectedPriceId` clears on its own.
 */
export type RepickPolicy = "free" | "warn" | "blocked";

export const repickPolicyLabels = {
  free: "Se puede recambiar",
  warn: "Recambio con aviso",
  blocked: "Precio fijo desde la primera asignación",
} as const satisfies Record<RepickPolicy, string>;

export type RepickReading = {
  /** No money on the inscription yet: the pick is free under every policy. */
  isFirstPick: boolean;
  canRepick: boolean;
  /** Shown before the change under `warn`; null when there is nothing to warn about. */
  warning: string | null;
  /** Shown in place of the picker under `blocked`. */
  blockedReason: string | null;
};

export function readRepick(
  inscription: InscriptionReading,
  policy: RepickPolicy,
): RepickReading {
  const isFirstPick = inscription.allocatedAmount === 0;

  if (isFirstPick) {
    return {
      isFirstPick,
      canRepick: true,
      warning: null,
      blockedReason: null,
    };
  }

  if (policy === "blocked") {
    return {
      isFirstPick,
      canRepick: false,
      warning: null,
      blockedReason:
        "Ya tiene plata asignada. Para cambiar el precio hay que sacarle toda la plata: al quedarse sin asignaciones el precio se limpia solo.",
    };
  }

  return {
    isFirstPick,
    canRepick: true,
    warning:
      policy === "warn"
        ? `Tiene ${formatAmount(inscription.allocatedAmount)} asignados contra el precio actual. Cambiarlo mueve la seña y el total, y puede dejarla sobreasignada.`
        : null,
    blockedReason: null,
  };
}

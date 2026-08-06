/**
 * THROWAWAY PROTOTYPE — ticket #550 of map #547.
 *
 * A module store, not a server one: the state has to survive navigating between
 * the prototype's two views (the choreography list and one choreography's
 * detail), and a per-route `useState` would lose it on every click. None of this
 * is saved: reloading the page brings the fixture back.
 */
import { useSyncExternalStore } from "react";

import {
  initialPrototypeState,
  readInscriptions,
  readPayments,
  selectPrice,
  upsertAllocation,
  type PrototypeState,
} from "./fixtures";
import {
  emitAmendment,
  emitComprobante,
  registerSibling,
  withdrawSibling,
} from "./roster-moves";
import {
  rejectAllocation,
  spreadFromPool,
  type AllocationRejection,
} from "./allocation-rules";
import { readAcademy, readChoreographies } from "./rollup";
import type { AllocationUpsert } from "./shared";

let current: PrototypeState = initialPrototypeState;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return current;
}

export function resetPrototypeState() {
  current = initialPrototypeState;
  emit();
}

/**
 * Everything derived in one place, so both views read exactly the same figures
 * and neither invents a reading of its own.
 */
export function usePrototype() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const inscriptions = readInscriptions(state);
  const payments = readPayments(state);
  const choreographies = readChoreographies(state, inscriptions);
  const academy = readAcademy(
    choreographies,
    payments.reduce((total, payment) => total + payment.availableAmount, 0),
  );

  return {
    state,
    inscriptions,
    payments,
    choreographies,
    academy,
    /**
     * #585's three gestures. None of them touches *this* choreography's roster
     * or its money: the point is that a change somewhere else moves the bill
     * here, which is the movement no screen attributes to its cause today.
     */
    onEmit: (choreographyId: string) => {
      current = emitComprobante(current, choreographyId);
      emit();
    },
    onEmitAmendment: (choreographyId: string) => {
      current = emitAmendment(current, choreographyId);
      emit();
    },
    onRegisterSibling: (dancerId: string, choreographyId: string) => {
      current = registerSibling(current, dancerId, choreographyId);
      emit();
    },
    onWithdrawSibling: (inscriptionId: string) => {
      current = withdrawSibling(current, inscriptionId);
      emit();
    },
    onSelectPrice: (inscriptionId: string, priceId: string) => {
      current = selectPrice(current, inscriptionId, priceId);
      emit();
    },
    /**
     * Draws `amount` from the academy's `Saldo disponible` and puts it on one
     * inscription. **No payment id**: which payments fund it is the fill rule's
     * business, not the admin's.
     *
     * Returns the rejection instead of throwing, so every caller has to decide
     * where to put the message — which is the point: #549 rejects active
     * over-allocation on the write path, and a surface that swallows the
     * refusal cannot be judged.
     */
    onAllocate: (
      inscriptionId: string,
      amount: number,
    ): AllocationRejection | null => {
      const inscription = inscriptions.find((row) => row.id === inscriptionId);

      if (inscription === undefined) {
        return null;
      }

      const rejection = rejectAllocation({
        inscription,
        availableBalanceAmount: academy.availableBalanceAmount,
        amount,
      });

      if (rejection !== null) {
        return rejection;
      }

      for (const slice of spreadFromPool(payments, amount)) {
        const existing =
          inscription.allocations.find(
            (allocation) => allocation.paymentId === slice.paymentId,
          )?.amount ?? 0;

        current = upsertAllocation(current, {
          paymentId: slice.paymentId,
          inscriptionId,
          amount: existing + slice.amount,
        });
      }

      emit();
      return null;
    },
    /**
     * The presets build their plan against the same pool and clamp each line to
     * its own target, so a plan cannot violate either rule; the upserts go in
     * unchecked on purpose, rather than re-deriving a guard that would only ever
     * pass.
     */
    onApplyUpserts: (upserts: AllocationUpsert[]) => {
      for (const upsert of upserts) {
        current = upsertAllocation(current, upsert);
      }
      emit();
    },
  };
}

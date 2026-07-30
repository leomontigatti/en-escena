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
    onSelectPrice: (inscriptionId: string, priceId: string | null) => {
      current = selectPrice(current, inscriptionId, priceId);
      emit();
    },
    onAllocate: (paymentId: string, inscriptionId: string, amount: number) => {
      if (paymentId === "") {
        return;
      }

      current = upsertAllocation(current, {
        paymentId,
        inscriptionId,
        amount,
      });
      emit();
    },
    onApplyUpserts: (upserts: AllocationUpsert[]) => {
      for (const upsert of upserts) {
        current = upsertAllocation(current, upsert);
      }
      emit();
    },
  };
}

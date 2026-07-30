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
  rejectAllocation,
  type AllocationRejection,
  type RepickPolicy,
} from "./allocation-rules";
import { readAcademy, readChoreographies } from "./rollup";
import type { AllocationUpsert } from "./shared";

let current: PrototypeState = initialPrototypeState;
/**
 * Which answer to "can the price be re-picked once money has landed" the
 * prototype is currently running. Not state of the model — a prototype switch,
 * so it lives beside it rather than inside `PrototypeState`.
 */
let currentRepickPolicy: RepickPolicy = "warn";
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

// One snapshot object covering both, rebuilt on every change: the re-pick
// policy is a switch the views render from, so flipping it has to re-render.
let snapshot: { state: PrototypeState; repickPolicy: RepickPolicy } = {
  state: current,
  repickPolicy: currentRepickPolicy,
};

function commit() {
  snapshot = { state: current, repickPolicy: currentRepickPolicy };
  emit();
}

function getSnapshot() {
  return snapshot;
}

export function resetPrototypeState() {
  current = initialPrototypeState;
  commit();
}

/**
 * Everything derived in one place, so both views read exactly the same figures
 * and neither invents a reading of its own.
 */
export function usePrototype() {
  const { state, repickPolicy } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getSnapshot,
  );

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
    repickPolicy,
    onChangeRepickPolicy: (policy: RepickPolicy) => {
      currentRepickPolicy = policy;
      commit();
    },
    onSelectPrice: (inscriptionId: string, priceId: string | null) => {
      current = selectPrice(current, inscriptionId, priceId);
      commit();
    },
    /**
     * Returns the rejection instead of throwing, so every caller has to decide
     * where to put the message — which is the point: #549 rejects active
     * over-allocation on the write path, and a surface that swallows the
     * refusal cannot be judged.
     */
    onAllocate: (
      paymentId: string,
      inscriptionId: string,
      amount: number,
    ): AllocationRejection | null => {
      if (paymentId === "") {
        return null;
      }

      const inscription = inscriptions.find((row) => row.id === inscriptionId);
      const payment = payments.find((row) => row.id === paymentId);

      if (inscription === undefined || payment === undefined) {
        return null;
      }

      const rejection = rejectAllocation({ inscription, payment, amount });

      if (rejection !== null) {
        return rejection;
      }

      current = upsertAllocation(current, {
        paymentId,
        inscriptionId,
        amount,
      });
      commit();
      return null;
    },
    /**
     * The presets build their plan against `availableAmount` and clamp each line
     * to its own target, so a plan cannot violate either rule; the upserts go in
     * unchecked on purpose, rather than re-deriving a guard that would only ever
     * pass.
     */
    onApplyUpserts: (upserts: AllocationUpsert[]) => {
      for (const upsert of upserts) {
        current = upsertAllocation(current, upsert);
      }
      commit();
    },
  };
}

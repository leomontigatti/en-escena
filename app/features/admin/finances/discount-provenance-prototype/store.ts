/**
 * THROWAWAY PROTOTYPE — ticket #585 of map #547.
 *
 * A module store, like #550's: the point of the prototype is that the bill moves
 * *while you are looking at it*, so the scenario buttons have to mutate shared
 * state rather than remount a fixture. Nothing is saved; reloading resets it.
 */
import { useSyncExternalStore } from "react";

import {
  emitComprobante,
  initialPrototypeState,
  readChoreography,
  registerSibling,
  withdrawSibling,
  type PrototypeState,
} from "./fixtures";

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

export function usePrototype() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return {
    state,
    choreography: readChoreography(state),
    onReset: () => {
      current = initialPrototypeState;
      emit();
    },
    onEmit: () => {
      current = emitComprobante(current);
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
  };
}

export type Prototype = ReturnType<typeof usePrototype>;

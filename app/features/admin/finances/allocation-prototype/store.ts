/**
 * PROTOTIPO DESCARTABLE — ticket #550 del mapa #547.
 *
 * Store de módulo, no de servidor: el estado tiene que sobrevivir a la navegación
 * entre las dos vistas del prototipo (lista de coreografías y detalle de una), y
 * un `useState` por ruta lo perdería en cada clic. Nada de esto se guarda: al
 * recargar la página vuelve la fixture.
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
 * Todo lo derivado en un solo lugar, así las dos vistas leen exactamente las
 * mismas figuras y ninguna se inventa una lectura propia.
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

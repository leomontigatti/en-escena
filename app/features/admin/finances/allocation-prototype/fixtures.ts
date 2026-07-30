/**
 * PROTOTIPO DESCARTABLE — ticket #550 del mapa #547. No usar como referencia de
 * implementación.
 *
 * Datos en memoria con la forma del modelo *nuevo* (monto arbitrario de cualquier
 * pago sobre cualquier inscripción), no con la del esquema actual: la forma de la
 * tabla de asignaciones todavía está abierta en #549, así que acá no se toca la
 * base. Una asignación es `(pago, inscripción, monto)`, sin `allocation_type`, y
 * la inscripción sólo guarda `selectedPriceId`.
 */

export type PrototypePriceRow = {
  id: string;
  name: string;
  amount: number;
  paymentDeadline: string;
};

export type PrototypePayment = {
  id: string;
  number: number;
  paymentDate: string;
  amount: number;
  method: string;
};

export type PrototypeAllocation = {
  paymentId: string;
  inscriptionId: string;
  amount: number;
};

export type PrototypeInscription = {
  id: string;
  choreographyId: string;
  dancerName: string;
  selectedPriceId: string | null;
  dancerDiscountAmount: number;
};

export type PrototypeChoreography = {
  id: string;
  name: string;
  groupType: string;
};

export type PrototypeState = {
  requiredDepositPercentage: number;
  prices: PrototypePriceRow[];
  payments: PrototypePayment[];
  choreographies: PrototypeChoreography[];
  inscriptions: PrototypeInscription[];
  allocations: PrototypeAllocation[];
};

export const prototypePrices: PrototypePriceRow[] = [
  {
    id: "price-early",
    name: "Preventa",
    amount: 42000,
    paymentDeadline: "2026-04-30",
  },
  {
    id: "price-regular",
    name: "General",
    amount: 52000,
    paymentDeadline: "2026-06-30",
  },
  {
    id: "price-late",
    name: "Tardía",
    amount: 64000,
    paymentDeadline: "2026-08-15",
  },
];

export const initialPrototypeState: PrototypeState = {
  requiredDepositPercentage: 30,
  prices: prototypePrices,
  payments: [
    {
      id: "pay-1",
      number: 41,
      paymentDate: "2026-07-02",
      amount: 300000,
      method: "Transferencia",
    },
    {
      id: "pay-2",
      number: 47,
      paymentDate: "2026-07-18",
      amount: 120000,
      method: "Transferencia",
    },
    {
      id: "pay-3",
      number: 52,
      paymentDate: "2026-07-26",
      amount: 35000,
      method: "Efectivo",
    },
  ],
  choreographies: [
    { id: "cho-1", name: "Reflejos", groupType: "Grupo" },
    { id: "cho-2", name: "Umbral", groupType: "Dúo" },
  ],
  inscriptions: [
    // Roster deliberadamente desparejo: sin precio elegido, por debajo del
    // umbral, cruzando el umbral, saldada, y sobreasignada.
    {
      id: "ins-1",
      choreographyId: "cho-1",
      dancerName: "Ana Rivas",
      selectedPriceId: "price-regular",
      dancerDiscountAmount: 0,
    },
    {
      id: "ins-2",
      choreographyId: "cho-1",
      dancerName: "Bruno Salas",
      selectedPriceId: "price-regular",
      dancerDiscountAmount: 5200,
    },
    {
      id: "ins-3",
      choreographyId: "cho-1",
      dancerName: "Camila Duarte",
      selectedPriceId: "price-early",
      dancerDiscountAmount: 0,
    },
    {
      id: "ins-4",
      choreographyId: "cho-1",
      dancerName: "Delfina Ojeda",
      selectedPriceId: null,
      dancerDiscountAmount: 0,
    },
    {
      id: "ins-5",
      choreographyId: "cho-1",
      dancerName: "Emilia Ponce",
      selectedPriceId: "price-regular",
      dancerDiscountAmount: 0,
    },
    {
      id: "ins-6",
      choreographyId: "cho-1",
      dancerName: "Facundo Ledesma",
      selectedPriceId: "price-late",
      dancerDiscountAmount: 0,
    },
    {
      id: "ins-7",
      choreographyId: "cho-2",
      dancerName: "Gala Iriarte",
      selectedPriceId: "price-regular",
      dancerDiscountAmount: 7800,
    },
    {
      id: "ins-8",
      choreographyId: "cho-2",
      dancerName: "Hernán Vidal",
      selectedPriceId: null,
      dancerDiscountAmount: 0,
    },
  ],
  allocations: [
    { paymentId: "pay-1", inscriptionId: "ins-1", amount: 52000 },
    { paymentId: "pay-1", inscriptionId: "ins-2", amount: 20000 },
    { paymentId: "pay-1", inscriptionId: "ins-3", amount: 12000 },
    { paymentId: "pay-2", inscriptionId: "ins-3", amount: 6000 },
    { paymentId: "pay-1", inscriptionId: "ins-5", amount: 15600 },
    { paymentId: "pay-2", inscriptionId: "ins-6", amount: 70000 },
    { paymentId: "pay-1", inscriptionId: "ins-7", amount: 4000 },
  ],
};

export type InscriptionReading = {
  id: string;
  choreographyId: string;
  choreographyName: string;
  dancerName: string;
  selectedPriceId: string | null;
  priceName: string | null;
  priceAmount: number | null;
  discountAmount: number;
  /** Precio elegido menos descuento. `null` mientras no haya precio elegido. */
  owedAmount: number | null;
  allocatedAmount: number;
  /** `owed - allocated`, con piso en cero. */
  remainingAmount: number | null;
  /** Excedente tolerado (sobreasignación pasiva, decisión de #549). */
  excessAmount: number;
  /** `requiredDepositPercentage × owed`. */
  thresholdAmount: number | null;
  thresholdCrossed: boolean;
  settled: boolean;
  allocations: PrototypeAllocation[];
};

export function readInscriptions(state: PrototypeState): InscriptionReading[] {
  return state.inscriptions.map((inscription) => {
    const price =
      state.prices.find((row) => row.id === inscription.selectedPriceId) ??
      null;
    const choreography = state.choreographies.find(
      (row) => row.id === inscription.choreographyId,
    );
    const allocations = state.allocations.filter(
      (allocation) => allocation.inscriptionId === inscription.id,
    );
    const allocatedAmount = sumAmounts(allocations);
    const owedAmount =
      price === null
        ? null
        : Math.max(0, price.amount - inscription.dancerDiscountAmount);
    const thresholdAmount =
      owedAmount === null
        ? null
        : Math.round((owedAmount * state.requiredDepositPercentage) / 100);

    return {
      id: inscription.id,
      choreographyId: inscription.choreographyId,
      choreographyName: choreography?.name ?? "",
      dancerName: inscription.dancerName,
      selectedPriceId: inscription.selectedPriceId,
      priceName: price?.name ?? null,
      priceAmount: price?.amount ?? null,
      discountAmount: inscription.dancerDiscountAmount,
      owedAmount,
      allocatedAmount,
      remainingAmount:
        owedAmount === null ? null : Math.max(0, owedAmount - allocatedAmount),
      excessAmount:
        owedAmount === null ? 0 : Math.max(0, allocatedAmount - owedAmount),
      thresholdAmount,
      thresholdCrossed:
        thresholdAmount !== null && allocatedAmount >= thresholdAmount,
      settled: owedAmount !== null && allocatedAmount >= owedAmount,
      allocations,
    };
  });
}

export type PaymentReading = PrototypePayment & {
  allocatedAmount: number;
  availableAmount: number;
};

export function readPayments(state: PrototypeState): PaymentReading[] {
  return state.payments.map((payment) => {
    const allocatedAmount = sumAmounts(
      state.allocations.filter(
        (allocation) => allocation.paymentId === payment.id,
      ),
    );

    return {
      ...payment,
      allocatedAmount,
      availableAmount: payment.amount - allocatedAmount,
    };
  });
}

export function sumAmounts(allocations: { amount: number }[]) {
  return allocations.reduce(
    (total, allocation) => total + allocation.amount,
    0,
  );
}

/**
 * Upsert de `(pago, inscripción)` con monto mutable, la forma que decidió #549.
 * Monto cero borra la fila.
 */
export function upsertAllocation(
  state: PrototypeState,
  next: PrototypeAllocation,
): PrototypeState {
  const rest = state.allocations.filter(
    (allocation) =>
      allocation.paymentId !== next.paymentId ||
      allocation.inscriptionId !== next.inscriptionId,
  );

  return {
    ...state,
    allocations: next.amount > 0 ? [...rest, next] : rest,
  };
}

export function selectPrice(
  state: PrototypeState,
  inscriptionId: string,
  priceId: string | null,
): PrototypeState {
  return {
    ...state,
    inscriptions: state.inscriptions.map((inscription) =>
      inscription.id === inscriptionId
        ? { ...inscription, selectedPriceId: priceId }
        : inscription,
    ),
  };
}

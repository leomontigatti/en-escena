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
  /** Necesario para `groupTypeMismatch`, la anomalía que definió #551. */
  groupType: string;
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
    name: "Preventa grupo",
    amount: 42000,
    paymentDeadline: "2026-04-30",
    groupType: "Grupo",
  },
  {
    id: "price-regular",
    name: "General grupo",
    amount: 52000,
    paymentDeadline: "2026-06-30",
    groupType: "Grupo",
  },
  {
    id: "price-late",
    name: "Tardía grupo",
    amount: 64000,
    paymentDeadline: "2026-08-15",
    groupType: "Grupo",
  },
  {
    id: "price-duo",
    name: "General dúo",
    amount: 68000,
    paymentDeadline: "2026-06-30",
    groupType: "Dúo",
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
    { id: "cho-3", name: "Vértigo", groupType: "Grupo" },
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
    // Coreografía al día: le da a la lista una fila `Pagada` contra la que
    // comparar, y prueba que la acción masiva la excluya sola.
    {
      id: "ins-9",
      choreographyId: "cho-3",
      dancerName: "Irina Costa",
      selectedPriceId: "price-early",
      dancerDiscountAmount: 0,
    },
    {
      id: "ins-10",
      choreographyId: "cho-3",
      dancerName: "Julián Mora",
      selectedPriceId: "price-early",
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
    { paymentId: "pay-1", inscriptionId: "ins-9", amount: 42000 },
    { paymentId: "pay-1", inscriptionId: "ins-10", amount: 42000 },
  ],
};

/** Los tres estados que sobreviven a la escalera, con los nombres de #551. */
export type InscriptionFinancialStatus =
  | "depositPending"
  | "depositMet"
  | "paidInFull";

export type InscriptionReading = {
  id: string;
  choreographyId: string;
  choreographyName: string;
  dancerName: string;
  selectedPriceId: string | null;
  priceName: string | null;
  priceAmount: number | null;
  discountAmount: number;
  /**
   * #551: el descuento se aplica **una sola vez**, acá adentro. `null` mientras
   * no haya precio elegido, que es el caso tentativo.
   */
  totalAmount: number | null;
  /**
   * #551: el porcentaje corre sobre el precio **sin descuento**, para que el
   * umbral no se mueva por debajo de la academia cuando cambia el descuento.
   */
  depositAmount: number | null;
  allocatedAmount: number;
  /** Faltante *hasta el umbral* de seña, con piso en cero. */
  owedDepositAmount: number | null;
  /** Bruto (#551): `totalAmount - allocated`, no neto del descuento. */
  owedBalanceAmount: number | null;
  /** Excedente tolerado (sobreasignación pasiva, decisión de #549). */
  excessAmount: number;
  /** `null` mientras no haya precio elegido: no hay contra qué comparar. */
  status: InscriptionFinancialStatus | null;
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
    const totalAmount =
      price === null
        ? null
        : Math.max(0, price.amount - inscription.dancerDiscountAmount);
    const depositAmount =
      price === null
        ? null
        : Math.round((price.amount * state.requiredDepositPercentage) / 100);

    return {
      id: inscription.id,
      choreographyId: inscription.choreographyId,
      choreographyName: choreography?.name ?? "",
      dancerName: inscription.dancerName,
      selectedPriceId: inscription.selectedPriceId,
      priceName: price?.name ?? null,
      priceAmount: price?.amount ?? null,
      discountAmount: inscription.dancerDiscountAmount,
      totalAmount,
      depositAmount,
      allocatedAmount,
      owedDepositAmount:
        depositAmount === null
          ? null
          : Math.max(0, depositAmount - allocatedAmount),
      owedBalanceAmount:
        totalAmount === null
          ? null
          : Math.max(0, totalAmount - allocatedAmount),
      excessAmount:
        totalAmount === null ? 0 : Math.max(0, allocatedAmount - totalAmount),
      status: readStatus({ allocatedAmount, depositAmount, totalAmount }),
      allocations,
    };
  });
}

function readStatus({
  allocatedAmount,
  depositAmount,
  totalAmount,
}: {
  allocatedAmount: number;
  depositAmount: number | null;
  totalAmount: number | null;
}): InscriptionFinancialStatus | null {
  if (depositAmount === null || totalAmount === null) {
    return null;
  }

  if (allocatedAmount >= totalAmount) {
    return "paidInFull";
  }

  // `Seña pendiente` es el caso que la escalera hacía imposible: plata puesta,
  // pero todavía por debajo del umbral.
  return allocatedAmount >= depositAmount ? "depositMet" : "depositPending";
}

export const inscriptionStatusLabels = {
  depositPending: "Seña pendiente",
  depositMet: "Señada",
  paidInFull: "Pagada",
} as const satisfies Record<InscriptionFinancialStatus, string>;

export const inscriptionStatusBadgeVariants = {
  depositPending: "warning",
  depositMet: "info",
  paidInFull: "success",
} as const satisfies Record<InscriptionFinancialStatus, string>;

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

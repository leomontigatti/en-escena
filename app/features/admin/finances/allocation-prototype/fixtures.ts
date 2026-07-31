/**
 * THROWAWAY PROTOTYPE — ticket #550 of map #547. Not an implementation reference.
 *
 * In-memory data shaped like the *new* model (an arbitrary amount of any payment
 * against any inscription), not like the current schema: the allocation table's
 * shape is still open in #549, so nothing here touches the database. An
 * allocation is `(payment, inscription, amount)`, with no `allocation_type`, and
 * the inscription only keeps `selectedPriceId`.
 *
 * **`selectedPriceId` is never null.** A choreography resolves a default price
 * when it is created, and every inscription starts on it, so there is no such
 * thing as an inscription with nothing to measure against. This is why there is
 * no `Sin precio` status and no tentative-for-lack-of-price figure.
 */

export type PrototypePriceRow = {
  id: string;
  name: string;
  amount: number;
  paymentDeadline: string;
  /** Needed for `groupTypeMismatch`, the anomaly #551 defined. */
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
  selectedPriceId: string;
  dancerDiscountAmount: number;
};

export type PrototypeChoreography = {
  id: string;
  name: string;
  groupType: string;
  /** Resolved when the choreography is created; an inscription falls back here. */
  defaultPriceId: string;
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
    {
      id: "cho-1",
      name: "Reflejos",
      groupType: "Grupo",
      defaultPriceId: "price-regular",
    },
    {
      id: "cho-2",
      name: "Umbral",
      groupType: "Dúo",
      defaultPriceId: "price-duo",
    },
    {
      id: "cho-3",
      name: "Vértigo",
      groupType: "Grupo",
      defaultPriceId: "price-early",
    },
  ],
  inscriptions: [
    // A deliberately uneven roster: untouched, below the threshold, over the
    // threshold, settled, and one price of the wrong group type.
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
      selectedPriceId: "price-regular",
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
      selectedPriceId: "price-duo",
      dancerDiscountAmount: 0,
    },
    // A choreography that is up to date: gives the list a `Pagada` row to
    // compare against, and proves the bulk action excludes it on its own.
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

/** The three statuses that survive the ladder, named as #551 decided. */
export type InscriptionFinancialStatus =
  | "depositPending"
  | "depositMet"
  | "paidInFull";

export type InscriptionReading = {
  id: string;
  choreographyId: string;
  choreographyName: string;
  dancerName: string;
  selectedPriceId: string;
  priceName: string;
  priceAmount: number;
  /** The chosen price's group type, for #551's `groupTypeMismatch`. */
  priceGroupType: string;
  discountAmount: number;
  /** #551: the discount is applied **once**, in here. */
  totalAmount: number;
  /**
   * #551: the percentage runs on the **undiscounted** price, so the threshold
   * cannot move under the academy when the discount changes.
   */
  depositAmount: number;
  allocatedAmount: number;
  /** Shortfall *to the deposit threshold*, floored at zero. */
  owedDepositAmount: number;
  /** Gross (#551): `totalAmount - allocated`, not net of the discount. */
  owedBalanceAmount: number;
  /** Tolerated excess (passive over-allocation, #549's decision). */
  excessAmount: number;
  status: InscriptionFinancialStatus;
  allocations: PrototypeAllocation[];
};

export function readInscriptions(state: PrototypeState): InscriptionReading[] {
  return state.inscriptions.map((inscription) => {
    const choreography = state.choreographies.find(
      (row) => row.id === inscription.choreographyId,
    );
    const price = state.prices.find(
      (row) => row.id === inscription.selectedPriceId,
    );

    if (price === undefined) {
      throw new Error(`inscription ${inscription.id} has no price`);
    }

    const allocations = state.allocations.filter(
      (allocation) => allocation.inscriptionId === inscription.id,
    );
    const allocatedAmount = sumAmounts(allocations);
    const totalAmount = Math.max(
      0,
      price.amount - inscription.dancerDiscountAmount,
    );
    const depositAmount = Math.round(
      (price.amount * state.requiredDepositPercentage) / 100,
    );

    return {
      id: inscription.id,
      choreographyId: inscription.choreographyId,
      choreographyName: choreography?.name ?? "",
      dancerName: inscription.dancerName,
      selectedPriceId: inscription.selectedPriceId,
      priceName: price.name,
      priceAmount: price.amount,
      priceGroupType: price.groupType,
      discountAmount: inscription.dancerDiscountAmount,
      totalAmount,
      depositAmount,
      allocatedAmount,
      owedDepositAmount: Math.max(0, depositAmount - allocatedAmount),
      owedBalanceAmount: Math.max(0, totalAmount - allocatedAmount),
      excessAmount: Math.max(0, allocatedAmount - totalAmount),
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
  depositAmount: number;
  totalAmount: number;
}): InscriptionFinancialStatus {
  if (allocatedAmount >= totalAmount) {
    return "paidInFull";
  }

  // `Seña pendiente` is the case the ladder made impossible: money placed, but
  // still below the threshold.
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
 * Upsert on `(payment, inscription)` with a mutable amount, the shape #549
 * decided. A zero amount deletes the row.
 *
 * And #549's mirror rule, which #551 handed to this surface to express:
 * **`selectedPriceId` clears when an inscription runs out of allocations.** The
 * price is chosen as part of putting money on an inscription, so an inscription
 * with no money has made no choice; it goes back to a tentative price and the
 * admin re-picks on the next allocation.
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
  const allocations = next.amount > 0 ? [...rest, next] : rest;
  const ranOutOfAllocations = !allocations.some(
    (allocation) => allocation.inscriptionId === next.inscriptionId,
  );

  return {
    ...state,
    allocations,
    inscriptions: ranOutOfAllocations
      ? state.inscriptions.map((inscription) =>
          inscription.id === next.inscriptionId
            ? {
                ...inscription,
                selectedPriceId: defaultPriceIdOf(state, inscription),
              }
            : inscription,
        )
      : state.inscriptions,
  };
}

function defaultPriceIdOf(
  state: PrototypeState,
  inscription: PrototypeInscription,
) {
  return (
    state.choreographies.find((row) => row.id === inscription.choreographyId)
      ?.defaultPriceId ?? inscription.selectedPriceId
  );
}

export function selectPrice(
  state: PrototypeState,
  inscriptionId: string,
  priceId: string,
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

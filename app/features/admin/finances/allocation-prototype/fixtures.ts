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

import { readDancerDiscount, type DancerDiscountProvenance } from "./discount";

export type PrototypePriceRow = {
  id: string;
  name: string;
  amount: number;
  paymentDeadline: string;
  /**
   * Only picks the menu of rows applicable to a choreography. It is no longer an
   * anomaly source: #586 deleted `groupTypeMismatch` by refreshing the price
   * when the `groupType` changes, so a mismatch cannot survive a roster write.
   */
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

export type PrototypeDancer = {
  id: string;
  name: string;
};

export type PrototypeInscription = {
  id: string;
  choreographyId: string;
  /**
   * #585: the dancer has an **identity**, not just a name on this row. The
   * discount is earned by all of this dancer's registered inscriptions in the
   * academy and event, so the same person has to be recognisable across
   * choreographies.
   */
  dancerId: string;
  selectedPriceId: string;
  /**
   * Soft withdrawal (decision 21, as amended by #600). It drops out of the
   * qualifying set and out of every rollup, but **it does not disappear**: the
   * row exists precisely because it holds evidence — money or an invoice line —
   * and a removal with neither is a hard delete instead.
   */
  withdrawnAt: string | null;
};

/** An ND or an NC, hanging off the factura: #599's star-shaped amendment chain. */
export type PrototypeAmendment = {
  label: string;
  emittedOn: string;
  /** Signed: positive was a débito, negative a crédito. */
  amount: number;
};

/** One line per inscription, at the net amount — #554's printed shape. */
export type PrototypeComprobanteLine = {
  inscriptionId: string;
  amount: number;
};

export type PrototypeComprobante = {
  label: string;
  emittedOn: string;
  lines: PrototypeComprobanteLine[];
  /** Emitted amendments, newest last. Each one closes the delta of its moment. */
  amendments: PrototypeAmendment[];
};

export type PrototypeChoreography = {
  id: string;
  name: string;
  groupType: string;
  /** Resolved when the choreography is created; an inscription falls back here. */
  defaultPriceId: string;
  /** `null` until the choreography is `Señada` and billed (decision 15). */
  comprobante: PrototypeComprobante | null;
};

export type PrototypeState = {
  requiredDepositPercentage: number;
  prices: PrototypePriceRow[];
  payments: PrototypePayment[];
  dancers: PrototypeDancer[];
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
  dancers: [
    { id: "dan-ana", name: "Ana Rivas" },
    { id: "dan-bruno", name: "Bruno Salas" },
    { id: "dan-camila", name: "Camila Duarte" },
    { id: "dan-delfina", name: "Delfina Ojeda" },
    { id: "dan-emilia", name: "Emilia Ponce" },
    { id: "dan-facundo", name: "Facundo Ledesma" },
    { id: "dan-gala", name: "Gala Iriarte" },
    { id: "dan-julian", name: "Julián Mora" },
    { id: "dan-nadia", name: "Nadia Coria" },
  ],
  choreographies: [
    {
      id: "cho-1",
      name: "Reflejos",
      groupType: "Grupo",
      defaultPriceId: "price-regular",
      comprobante: null,
    },
    {
      id: "cho-2",
      name: "Umbral",
      groupType: "Dúo",
      defaultPriceId: "price-duo",
      comprobante: null,
    },
    {
      id: "cho-3",
      name: "Vértigo",
      groupType: "Grupo",
      defaultPriceId: "price-early",
      comprobante: null,
    },
    // #585: two more choreographies with no money on them, purely so a dancer's
    // qualifying set spans more than what any one screen shows.
    {
      id: "cho-4",
      name: "Ecos",
      groupType: "Grupo",
      defaultPriceId: "price-early",
      comprobante: null,
    },
    {
      id: "cho-5",
      name: "Brisa",
      groupType: "Grupo",
      defaultPriceId: "price-early",
      comprobante: null,
    },
  ],
  inscriptions: [
    // A deliberately uneven roster: untouched, below the threshold, over the
    // threshold, settled, and one withdrawn row that still holds money.
    //
    // #585 added the second axis — who each dancer *also* is elsewhere:
    //
    // - **Ana** — 3 inscriptions, 10 %, and her most expensive is the dúo in
    //   «Umbral», so the exclusion is held off-screen and this row keeps it.
    // - **Bruno** — 4 inscriptions, 15 %, but this one *is* his most expensive,
    //   so he reads `$ 0` on a row identical to Ana's, which reads 10 %.
    // - **Camila** — 3 inscriptions all at the same price, so «la más cara»
    //   picks one of three identical numbers and she keeps her discount.
    // - **Emilia** — 3 inscriptions, one **dada de baja** with money on it, so
    //   she drops to 2 and the discount is gone. That withdrawal is in another
    //   choreography; **Nadia**'s is in this one, so the row is on screen.
    // - **Delfina**, **Facundo**, **Gala**, **Julián** — one each: the plain
    //   case, and the zero that needs no explanation.
    {
      id: "ins-1",
      choreographyId: "cho-1",
      dancerId: "dan-ana",
      selectedPriceId: "price-regular",
      withdrawnAt: null,
    },
    {
      id: "ins-2",
      choreographyId: "cho-1",
      dancerId: "dan-bruno",
      selectedPriceId: "price-regular",
      withdrawnAt: null,
    },
    {
      id: "ins-3",
      choreographyId: "cho-1",
      dancerId: "dan-camila",
      selectedPriceId: "price-early",
      withdrawnAt: null,
    },
    {
      id: "ins-4",
      choreographyId: "cho-1",
      dancerId: "dan-delfina",
      selectedPriceId: "price-regular",
      withdrawnAt: null,
    },
    {
      id: "ins-5",
      choreographyId: "cho-1",
      dancerId: "dan-emilia",
      selectedPriceId: "price-regular",
      withdrawnAt: null,
    },
    {
      id: "ins-6",
      choreographyId: "cho-1",
      dancerId: "dan-facundo",
      selectedPriceId: "price-late",
      withdrawnAt: null,
    },
    {
      id: "ins-7",
      choreographyId: "cho-2",
      dancerId: "dan-gala",
      selectedPriceId: "price-duo",
      withdrawnAt: null,
    },
    // #600: given de baja with money already on it, so it is withdrawn rather
    // than deleted — and it stays on the roster, because that allocation is the
    // only thing that explains where the academy's money went.
    {
      id: "ins-18",
      choreographyId: "cho-1",
      dancerId: "dan-nadia",
      selectedPriceId: "price-regular",
      withdrawnAt: "2026-07-30",
    },
    {
      id: "ins-8",
      choreographyId: "cho-2",
      dancerId: "dan-ana",
      selectedPriceId: "price-duo",
      withdrawnAt: null,
    },
    // A choreography that is up to date: gives the list a `Pagada` row to
    // compare against, and proves the bulk action excludes it on its own.
    {
      id: "ins-9",
      choreographyId: "cho-3",
      dancerId: "dan-bruno",
      selectedPriceId: "price-early",
      withdrawnAt: null,
    },
    {
      id: "ins-10",
      choreographyId: "cho-3",
      dancerId: "dan-julian",
      selectedPriceId: "price-early",
      withdrawnAt: null,
    },
    // No allocations on any of these: they exist to be *counted*, which is
    // exactly the point — a tier is earned by registration, before any money.
    {
      id: "ins-11",
      choreographyId: "cho-4",
      dancerId: "dan-ana",
      selectedPriceId: "price-early",
      withdrawnAt: null,
    },
    {
      id: "ins-12",
      choreographyId: "cho-4",
      dancerId: "dan-bruno",
      selectedPriceId: "price-early",
      withdrawnAt: null,
    },
    {
      id: "ins-13",
      choreographyId: "cho-5",
      dancerId: "dan-bruno",
      selectedPriceId: "price-early",
      withdrawnAt: null,
    },
    {
      id: "ins-14",
      choreographyId: "cho-4",
      dancerId: "dan-camila",
      selectedPriceId: "price-early",
      withdrawnAt: null,
    },
    {
      id: "ins-15",
      choreographyId: "cho-5",
      dancerId: "dan-camila",
      selectedPriceId: "price-early",
      withdrawnAt: null,
    },
    {
      id: "ins-16",
      choreographyId: "cho-5",
      dancerId: "dan-emilia",
      // Her most expensive, so reviving this one gives *this* choreography the
      // discount rather than taking the exclusion away from it.
      selectedPriceId: "price-late",
      withdrawnAt: "2026-07-28",
    },
    {
      id: "ins-17",
      choreographyId: "cho-4",
      dancerId: "dan-emilia",
      selectedPriceId: "price-early",
      withdrawnAt: null,
    },
  ],
  allocations: [
    { paymentId: "pay-1", inscriptionId: "ins-1", amount: 52000 },
    { paymentId: "pay-1", inscriptionId: "ins-2", amount: 20000 },
    { paymentId: "pay-1", inscriptionId: "ins-3", amount: 12000 },
    { paymentId: "pay-2", inscriptionId: "ins-3", amount: 6000 },
    { paymentId: "pay-1", inscriptionId: "ins-4", amount: 15600 },
    { paymentId: "pay-1", inscriptionId: "ins-5", amount: 15600 },
    { paymentId: "pay-2", inscriptionId: "ins-6", amount: 70000 },
    { paymentId: "pay-1", inscriptionId: "ins-7", amount: 4000 },
    { paymentId: "pay-1", inscriptionId: "ins-9", amount: 42000 },
    { paymentId: "pay-1", inscriptionId: "ins-10", amount: 42000 },
    // The two withdrawn rows' money: what makes each of them a withdrawal
    // instead of a delete (#600).
    { paymentId: "pay-2", inscriptionId: "ins-18", amount: 15600 },
    { paymentId: "pay-3", inscriptionId: "ins-16", amount: 19200 },
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
  dancerId: string;
  dancerName: string;
  selectedPriceId: string;
  priceName: string;
  priceAmount: number;
  /** Only to name the row's price row; no longer an anomaly source (#586). */
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
  /** #585: where the discount comes from, never just how much it is. */
  provenance: DancerDiscountProvenance;
  /** What the emitted factura says this inscription costs, if one exists. */
  documentedAmount: number | null;
  /**
   * #600: the row is `Retirada` — a **separate derived axis**, which replaces
   * the status badge rather than becoming a fourth status.
   */
  withdrawnAt: string | null;
};

/**
 * A withdrawn inscription is **out of every figure and still on the screen**
 * ([#600](https://github.com/leomontigatti/en-escena/issues/600)): it owes zero,
 * counts for nothing in the qualifying set and adds nothing to the rollup, but
 * it keeps the money already allocated to it — which is the only thing on any
 * surface that explains where that money went. A removal that had neither money
 * nor an invoice line is a hard delete instead, so a withdrawn row without
 * evidence cannot exist and is not rendered.
 */
export function readInscriptions(state: PrototypeState): InscriptionReading[] {
  return state.inscriptions
    .filter(
      (inscription) =>
        inscription.withdrawnAt === null || hasEvidence(state, inscription),
    )
    .map((inscription) => {
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
      const provenance = readDancerDiscount(
        state,
        inscription.dancerId,
        inscription.id,
      );
      // A withdrawn row is owed nothing and demands nothing: the figures go to
      // zero and only the money already on it survives (#600).
      const isWithdrawn = inscription.withdrawnAt !== null;
      const totalAmount = isWithdrawn
        ? 0
        : Math.max(0, price.amount - provenance.discountAmount);
      const depositAmount = isWithdrawn
        ? 0
        : Math.round((price.amount * state.requiredDepositPercentage) / 100);

      return {
        id: inscription.id,
        choreographyId: inscription.choreographyId,
        choreographyName: choreography?.name ?? "",
        dancerId: inscription.dancerId,
        dancerName: provenance.dancerName,
        selectedPriceId: inscription.selectedPriceId,
        priceName: price.name,
        priceAmount: price.amount,
        priceGroupType: price.groupType,
        discountAmount: provenance.discountAmount,
        provenance,
        documentedAmount:
          choreography?.comprobante?.lines.find(
            (line) => line.inscriptionId === inscription.id,
          )?.amount ?? null,
        totalAmount,
        depositAmount,
        allocatedAmount,
        owedDepositAmount: Math.max(0, depositAmount - allocatedAmount),
        owedBalanceAmount: Math.max(0, totalAmount - allocatedAmount),
        excessAmount: Math.max(0, allocatedAmount - totalAmount),
        status: readStatus({ allocatedAmount, depositAmount, totalAmount }),
        withdrawnAt: inscription.withdrawnAt,
        allocations,
      };
    });
}

/**
 * #600's predicate: money or an invoice line. It is what decides whether a
 * removal withdraws or deletes, so it is also what decides whether a withdrawn
 * row can be read at all.
 */
function hasEvidence(state: PrototypeState, inscription: PrototypeInscription) {
  return (
    state.allocations.some(
      (allocation) => allocation.inscriptionId === inscription.id,
    ) ||
    state.choreographies.some((choreography) =>
      choreography.comprobante?.lines.some(
        (line) => line.inscriptionId === inscription.id,
      ),
    )
  );
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

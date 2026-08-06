/**
 * THROWAWAY PROTOTYPE — ticket #585 of map #547. Not an implementation reference.
 *
 * In-memory data shaped like the model the map settled, not like the current
 * schema. Two things it exists to make visible, both invisible today:
 *
 * 1. **Provenance.** A dancer's tier is earned by *all* their registered active
 *    inscriptions in the same academy and event, so the percentage shown on this
 *    choreography can be earned — and the *excluded* one can be held — by
 *    inscriptions in two others. Hence dancers have ids and appear in several
 *    choreographies.
 * 2. **Movement.** The discount is always live (#552): registering or
 *    withdrawing a sibling recomputes it here, and once a factura exists the
 *    movement is a documented-vs-derived delta that owes an ND or an NC (#599).
 *
 * The tier rule is the documented one (`docs/domain/finances.md:385-400`),
 * including the part nothing on screen has ever explained: **one qualifying
 * inscription is left without a discount — the most expensive, ties broken by
 * id** — which is why a dancer with four inscriptions can read `0%` on this
 * screen while their siblings read `15%`.
 *
 * Not modelled: allocations as `(payment, inscription, amount)` rows, the
 * deposit threshold, price refresh. Money is a single `allocatedAmount` per
 * inscription, because none of it is what this ticket decides.
 */

export type PrototypePriceRow = {
  id: string;
  name: string;
  amount: number;
  groupType: string;
};

export type PrototypeDancer = {
  id: string;
  name: string;
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
};

export type PrototypeChoreography = {
  id: string;
  name: string;
  groupType: string;
  priceId: string;
  /** `null` until the choreography reaches `Señada` and is billed (decision 15). */
  comprobante: PrototypeComprobante | null;
};

export type PrototypeInscription = {
  id: string;
  choreographyId: string;
  dancerId: string;
  allocatedAmount: number;
  /** Soft withdrawal (decision 21): drops out of the qualifying set. */
  withdrawnAt: string | null;
};

export type PrototypeState = {
  academyName: string;
  eventName: string;
  requiredDepositPercentage: number;
  prices: PrototypePriceRow[];
  dancers: PrototypeDancer[];
  choreographies: PrototypeChoreography[];
  inscriptions: PrototypeInscription[];
};

/** The choreography this prototype's detail view is about. */
export const focusChoreographyId = "cho-reflejos";

export const prototypePrices: PrototypePriceRow[] = [
  {
    id: "price-grupo",
    name: "General grupo",
    amount: 52000,
    groupType: "Grupo",
  },
  {
    id: "price-preventa",
    name: "Preventa grupo",
    amount: 42000,
    groupType: "Grupo",
  },
  { id: "price-duo", name: "General dúo", amount: 68000, groupType: "Dúo" },
  { id: "price-solo", name: "General solo", amount: 90000, groupType: "Solo" },
];

export const prototypeDancers: PrototypeDancer[] = [
  { id: "dan-ana", name: "Ana Rivas" },
  { id: "dan-bruno", name: "Bruno Salas" },
  { id: "dan-camila", name: "Camila Duarte" },
  { id: "dan-delfina", name: "Delfina Ojeda" },
  { id: "dan-emilia", name: "Emilia Ponce" },
  { id: "dan-gala", name: "Gala Iriarte" },
  { id: "dan-hernan", name: "Hernán Vidal" },
];

const prototypeChoreographies: PrototypeChoreography[] = [
  {
    id: focusChoreographyId,
    name: "Reflejos",
    groupType: "Grupo",
    priceId: "price-grupo",
    comprobante: null,
  },
  {
    id: "cho-contemporaneo",
    name: "Contemporáneo juvenil",
    groupType: "Grupo",
    priceId: "price-grupo",
    comprobante: null,
  },
  {
    id: "cho-ecos",
    name: "Ecos",
    groupType: "Grupo",
    priceId: "price-preventa",
    comprobante: null,
  },
  {
    id: "cho-brisa",
    name: "Brisa",
    groupType: "Grupo",
    priceId: "price-preventa",
    comprobante: null,
  },
  {
    id: "cho-umbral",
    name: "Umbral",
    groupType: "Dúo",
    priceId: "price-duo",
    comprobante: null,
  },
  {
    id: "cho-vertigo",
    name: "Vértigo",
    groupType: "Solo",
    priceId: "price-solo",
    comprobante: null,
  },
];

/**
 * A roster picked so that every way the number can surprise a reader is on the
 * screen at once:
 *
 * - **Ana** — 3 inscriptions, 10%, and the excluded one is her *dúo*, in another
 *   choreography. The tier and the exclusion are both earned off-screen.
 * - **Bruno** — 4 inscriptions, 15%, excluded one is his solo. The dancer with
 *   the largest discount here is the one holding the most expensive inscription
 *   elsewhere.
 * - **Camila** — 2 inscriptions, no discount. A zero that is not a bug.
 * - **Delfina** — 1 inscription. The plain case.
 * - **Emilia** — 3 inscriptions, but one is **withdrawn**, so she drops to 2 and
 *   her discount is gone. The withdrawal is in another choreography.
 * - **Gala** — 3 inscriptions, so a 10% tier, but *this* inscription is the
 *   excluded one: her other two are preventa rows, so «Reflejos» is her most
 *   expensive. She reads `0%` beside dancers reading `10%` on identical rows.
 * - **Hernán** — 3 inscriptions, two of them at the same price, so the exclusion
 *   is decided by the **id tie-break**. He keeps his discount here for a reason
 *   no screen has ever been able to state.
 */
const prototypeInscriptions: PrototypeInscription[] = [
  // Reflejos — the roster on screen.
  {
    id: "ins-ana-reflejos",
    choreographyId: focusChoreographyId,
    dancerId: "dan-ana",
    allocatedAmount: 20000,
    withdrawnAt: null,
  },
  {
    id: "ins-bruno-reflejos",
    choreographyId: focusChoreographyId,
    dancerId: "dan-bruno",
    allocatedAmount: 44200,
    withdrawnAt: null,
  },
  {
    id: "ins-camila-reflejos",
    choreographyId: focusChoreographyId,
    dancerId: "dan-camila",
    allocatedAmount: 52000,
    withdrawnAt: null,
  },
  {
    id: "ins-delfina-reflejos",
    choreographyId: focusChoreographyId,
    dancerId: "dan-delfina",
    allocatedAmount: 15600,
    withdrawnAt: null,
  },
  {
    id: "ins-emilia-reflejos",
    choreographyId: focusChoreographyId,
    dancerId: "dan-emilia",
    allocatedAmount: 15600,
    withdrawnAt: null,
  },
  {
    id: "ins-gala-reflejos",
    choreographyId: focusChoreographyId,
    dancerId: "dan-gala",
    allocatedAmount: 20000,
    withdrawnAt: null,
  },
  {
    id: "ins-hernan-reflejos",
    choreographyId: focusChoreographyId,
    dancerId: "dan-hernan",
    allocatedAmount: 46800,
    withdrawnAt: null,
  },

  // The siblings that earn — or hold — the tiers above.
  {
    id: "ins-ana-contemporaneo",
    choreographyId: "cho-contemporaneo",
    dancerId: "dan-ana",
    allocatedAmount: 0,
    withdrawnAt: null,
  },
  {
    id: "ins-ana-umbral",
    choreographyId: "cho-umbral",
    dancerId: "dan-ana",
    allocatedAmount: 0,
    withdrawnAt: null,
  },
  {
    id: "ins-bruno-contemporaneo",
    choreographyId: "cho-contemporaneo",
    dancerId: "dan-bruno",
    allocatedAmount: 0,
    withdrawnAt: null,
  },
  {
    id: "ins-bruno-umbral",
    choreographyId: "cho-umbral",
    dancerId: "dan-bruno",
    allocatedAmount: 0,
    withdrawnAt: null,
  },
  {
    id: "ins-bruno-vertigo",
    choreographyId: "cho-vertigo",
    dancerId: "dan-bruno",
    allocatedAmount: 0,
    withdrawnAt: null,
  },
  {
    id: "ins-camila-contemporaneo",
    choreographyId: "cho-contemporaneo",
    dancerId: "dan-camila",
    allocatedAmount: 0,
    withdrawnAt: null,
  },
  {
    id: "ins-emilia-contemporaneo",
    choreographyId: "cho-contemporaneo",
    dancerId: "dan-emilia",
    allocatedAmount: 0,
    withdrawnAt: null,
  },
  {
    id: "ins-emilia-ecos",
    choreographyId: "cho-ecos",
    dancerId: "dan-emilia",
    allocatedAmount: 0,
    withdrawnAt: "2026-07-28",
  },
  // Gala's other two are preventa rows, so «Reflejos» — the choreography on
  // screen — is her most expensive and the one left without a discount.
  {
    id: "ins-gala-ecos",
    choreographyId: "cho-ecos",
    dancerId: "dan-gala",
    allocatedAmount: 0,
    withdrawnAt: null,
  },
  {
    id: "ins-gala-brisa",
    choreographyId: "cho-brisa",
    dancerId: "dan-gala",
    allocatedAmount: 0,
    withdrawnAt: null,
  },
  // Hernán ties «Reflejos» with «Contemporáneo juvenil» at the same price row;
  // the id tie-break excludes the other one, so his discount here is luck.
  {
    id: "ins-hernan-contemporaneo",
    choreographyId: "cho-contemporaneo",
    dancerId: "dan-hernan",
    allocatedAmount: 0,
    withdrawnAt: null,
  },
  {
    id: "ins-hernan-ecos",
    choreographyId: "cho-ecos",
    dancerId: "dan-hernan",
    allocatedAmount: 0,
    withdrawnAt: null,
  },
];

export const initialPrototypeState: PrototypeState = {
  academyName: "Estudio Norte",
  eventName: "Certamen Nacional 2026",
  requiredDepositPercentage: 30,
  prices: prototypePrices,
  dancers: prototypeDancers,
  choreographies: prototypeChoreographies,
  inscriptions: prototypeInscriptions,
};

// ---------------------------------------------------------------------------
// The rule
// ---------------------------------------------------------------------------

/** `docs/domain/finances.md:385-390`. Under 3 inscriptions there is no tier. */
export function readDiscountPercentage(qualifyingCount: number) {
  if (qualifyingCount >= 4) return 15;
  if (qualifyingCount === 3) return 10;
  return 0;
}

export type QualifyingInscription = {
  inscriptionId: string;
  choreographyId: string;
  choreographyName: string;
  priceAmount: number;
  isFocusChoreography: boolean;
  isExcluded: boolean;
  discountAmount: number;
};

export type DancerDiscountProvenance = {
  dancerId: string;
  dancerName: string;
  /** Registered, active inscriptions of this dancer in this academy and event. */
  qualifying: QualifyingInscription[];
  qualifyingCount: number;
  percentage: number;
  /** Dropped from the set by a soft withdrawal, kept so the drop is explicable. */
  withdrawn: QualifyingInscription[];
  /** The discount on *this* choreography's inscription. */
  discountAmount: number;
  reason: "belowTier" | "excludedAsMostExpensive" | "granted";
  /**
   * The exclusion was decided by the **id tie-break**, not by price: another
   * inscription costs exactly the same. Ties are the common case — a
   * choreography's inscriptions share a price row — so without this the reader
   * is told «la más cara» about two identical numbers.
   */
  excludedByTieBreak: boolean;
  excludedChoreographyName: string | null;
};

function priceOf(state: PrototypeState, choreographyId: string) {
  const choreography = state.choreographies.find(
    (row) => row.id === choreographyId,
  );
  const price = state.prices.find((row) => row.id === choreography?.priceId);

  if (choreography === undefined || price === undefined) {
    throw new Error(`choreography ${choreographyId} has no price`);
  }

  return { choreography, price };
}

/**
 * The whole derivation for one dancer, computed over the *academy and event* —
 * never over this choreography alone, which is exactly the scoping the screen
 * has never shown.
 */
export function readDancerDiscount(
  state: PrototypeState,
  dancerId: string,
  focusInscriptionId: string,
): DancerDiscountProvenance {
  const dancer = state.dancers.find((row) => row.id === dancerId);
  const own = state.inscriptions.filter((row) => row.dancerId === dancerId);

  const toQualifying = (inscription: PrototypeInscription) => {
    const { choreography, price } = priceOf(state, inscription.choreographyId);

    return {
      inscriptionId: inscription.id,
      choreographyId: choreography.id,
      choreographyName: choreography.name,
      priceAmount: price.amount,
      isFocusChoreography: choreography.id === focusChoreographyId,
      isExcluded: false,
      discountAmount: 0,
    };
  };

  const qualifying = own
    .filter((row) => row.withdrawnAt === null)
    .map(toQualifying);
  const withdrawn = own
    .filter((row) => row.withdrawnAt !== null)
    .map(toQualifying);

  const percentage = readDiscountPercentage(qualifying.length);

  // The most expensive inscription keeps its full price. Ties are the common
  // case — inscriptions of the same choreography share a price row — and the
  // documented tie-break is the id, which is why this can look arbitrary.
  const excluded =
    percentage === 0
      ? undefined
      : [...qualifying].sort(
          (left, right) =>
            right.priceAmount - left.priceAmount ||
            left.inscriptionId.localeCompare(right.inscriptionId),
        )[0];

  for (const row of qualifying) {
    row.isExcluded = row.inscriptionId === excluded?.inscriptionId;
    row.discountAmount = row.isExcluded
      ? 0
      : Math.round((row.priceAmount * percentage) / 100);
  }

  const focus = qualifying.find(
    (row) => row.inscriptionId === focusInscriptionId,
  );
  const tiedAtTop = qualifying.filter(
    (row) => row.priceAmount === excluded?.priceAmount,
  );

  return {
    dancerId,
    dancerName: dancer?.name ?? "",
    qualifying,
    qualifyingCount: qualifying.length,
    percentage,
    withdrawn,
    discountAmount: focus?.discountAmount ?? 0,
    reason:
      percentage === 0
        ? "belowTier"
        : focus?.isExcluded === true
          ? "excludedAsMostExpensive"
          : "granted",
    excludedByTieBreak: excluded !== undefined && tiedAtTop.length > 1,
    excludedChoreographyName: excluded?.choreographyName ?? null,
  };
}

// ---------------------------------------------------------------------------
// The reading the screen renders
// ---------------------------------------------------------------------------

export type InscriptionFinancialStatus =
  | "depositPending"
  | "depositMet"
  | "paidInFull";

export type InscriptionReading = {
  id: string;
  dancerId: string;
  dancerName: string;
  priceName: string;
  priceAmount: number;
  discountAmount: number;
  /** #552: `selectedPrice.amount − liveDancerDiscountAmount`, and nothing else. */
  totalAmount: number;
  /** #551: the percentage runs on the **undiscounted** price. */
  depositAmount: number;
  allocatedAmount: number;
  owedBalanceAmount: number;
  status: InscriptionFinancialStatus;
  withdrawnAt: string | null;
  provenance: DancerDiscountProvenance;
  /** What the emitted factura says this inscription costs, if one exists. */
  documentedAmount: number | null;
};

export function readChoreography(state: PrototypeState) {
  const { choreography, price } = priceOf(state, focusChoreographyId);
  const rows = state.inscriptions.filter(
    (row) => row.choreographyId === focusChoreographyId,
  );

  const inscriptions = rows.map((inscription): InscriptionReading => {
    const provenance = readDancerDiscount(
      state,
      inscription.dancerId,
      inscription.id,
    );
    const totalAmount = Math.max(0, price.amount - provenance.discountAmount);
    const depositAmount = Math.round(
      (price.amount * state.requiredDepositPercentage) / 100,
    );

    return {
      id: inscription.id,
      dancerId: inscription.dancerId,
      dancerName: provenance.dancerName,
      priceName: price.name,
      priceAmount: price.amount,
      discountAmount: provenance.discountAmount,
      totalAmount,
      depositAmount,
      allocatedAmount: inscription.allocatedAmount,
      owedBalanceAmount: Math.max(0, totalAmount - inscription.allocatedAmount),
      status: readStatus({
        allocatedAmount: inscription.allocatedAmount,
        depositAmount,
        totalAmount,
      }),
      withdrawnAt: inscription.withdrawnAt,
      provenance,
      documentedAmount:
        choreography.comprobante?.lines.find(
          (line) => line.inscriptionId === inscription.id,
        )?.amount ?? null,
    };
  });

  const derivedTotal = inscriptions
    .filter((row) => row.withdrawnAt === null)
    .reduce((total, row) => total + row.totalAmount, 0);
  const documentedTotal = choreography.comprobante?.lines.reduce(
    (total, line) => total + line.amount,
    0,
  );

  return {
    ...choreography,
    price,
    inscriptions,
    derivedTotal,
    documentedTotal: documentedTotal ?? null,
    /**
     * #599: the anomaly is keyed on money, not on the roster — the sign names
     * the document. Positive means the derived total outgrew what was billed,
     * so a nota de débito is owed; negative, a nota de crédito.
     */
    delta: documentedTotal === undefined ? 0 : derivedTotal - documentedTotal,
  };
}

export type ChoreographyReading = ReturnType<typeof readChoreography>;

function readStatus({
  allocatedAmount,
  depositAmount,
  totalAmount,
}: {
  allocatedAmount: number;
  depositAmount: number;
  totalAmount: number;
}): InscriptionFinancialStatus {
  if (allocatedAmount >= totalAmount) return "paidInFull";
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

// ---------------------------------------------------------------------------
// Mutations — the roster moves, and the bill moves with it
// ---------------------------------------------------------------------------

/** Bills the choreography at its currently derived amounts (decision 15). */
export function emitComprobante(state: PrototypeState): PrototypeState {
  const choreography = readChoreography(state);

  return {
    ...state,
    choreographies: state.choreographies.map((row) =>
      row.id === focusChoreographyId
        ? {
            ...row,
            comprobante: {
              label: "Factura C 0003-00000412",
              emittedOn: "2026-08-02",
              lines: choreography.inscriptions
                .filter((inscription) => inscription.withdrawnAt === null)
                .map((inscription) => ({
                  inscriptionId: inscription.id,
                  amount: inscription.totalAmount,
                })),
            },
          }
        : row,
    ),
  };
}

/** A sibling registration in another choreography. May raise a dancer's tier. */
export function registerSibling(
  state: PrototypeState,
  dancerId: string,
  choreographyId: string,
): PrototypeState {
  const existing = state.inscriptions.find(
    (row) => row.dancerId === dancerId && row.choreographyId === choreographyId,
  );

  // Decision 21's amendment: re-adding revives the withdrawn row.
  if (existing !== undefined) {
    return {
      ...state,
      inscriptions: state.inscriptions.map((row) =>
        row === existing ? { ...row, withdrawnAt: null } : row,
      ),
    };
  }

  return {
    ...state,
    inscriptions: [
      ...state.inscriptions,
      {
        id: `ins-${dancerId}-${choreographyId}`,
        choreographyId,
        dancerId,
        allocatedAmount: 0,
        withdrawnAt: null,
      },
    ],
  };
}

/** A soft withdrawal (decision 21). May drop a dancer below their tier. */
export function withdrawSibling(
  state: PrototypeState,
  inscriptionId: string,
): PrototypeState {
  return {
    ...state,
    inscriptions: state.inscriptions.map((row) =>
      row.id === inscriptionId ? { ...row, withdrawnAt: "2026-08-06" } : row,
    ),
  };
}

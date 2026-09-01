/**
 * The single owner of an inscription's money derivations: the three states, the
 * four figures and the anomaly array. No screen derives a threshold or a rollup
 * on its own again.
 *
 * Everything is derived on read against `Σ asignaciones`: nothing is written
 * when a threshold is crossed, and none of these figures is persisted.
 */

export type InscriptionFinancialStatus =
  | "depositPending"
  | "depositMet"
  | "paidInFull";

/** A choreography's rollup lives on the same scale as its inscriptions. */
export type ChoreographyFinancialStatus = InscriptionFinancialStatus;

/**
 * Anomalies: comparisons of the current state, all self-resolving and persisted
 * nowhere. `Sobreasignada` is the only one at this level.
 */
export type InscriptionAnomaly = "overAllocated";

/**
 * Explicit badge precedence, most urgent first. The array `anomalies` is built
 * by whoever derives it and its order is an implementation detail; which badge
 * wins is decided here and nowhere else, so adding an anomaly means adding it to
 * this list rather than hoping it got pushed in the right place.
 */
const inscriptionAnomalyPrecedence = [
  "overAllocated",
] as const satisfies readonly InscriptionAnomaly[];

/**
 * Order of the scale. `depositPending < depositMet < paidInFull`, which is what
 * makes the rollup a minimum rather than a high-water mark.
 */
const statusOrder: Record<InscriptionFinancialStatus, number> = {
  depositPending: 0,
  depositMet: 1,
  paidInFull: 2,
};

/**
 * An inscription's two thresholds. They are `null` together when there is no
 * applicable price: with no price there is no threshold to cross, and no figure
 * to owe.
 */
export type InscriptionThresholds = {
  depositAmount: number | null;
  totalAmount: number | null;
};

/** Everything an inscription derives from its money, in a single read. */
export type InscriptionFinancialFigures = {
  allocatedAmount: number;
  anomalies: InscriptionAnomaly[];
  depositAmount: number | null;
  financialStatus: InscriptionFinancialStatus;
  overAllocatedAmount: number | null;
  owedBalanceAmount: number | null;
  owedDepositAmount: number | null;
  totalAmount: number | null;
};

/**
 * The inscription's `Seña`: computed on the price **before any discount**, so
 * that the threshold does not move under the academy's feet when the
 * `Descuento por bailarín` changes with the roster.
 */
export function calculateDepositAmount(input: {
  priceAmount: number;
  requiredDepositPercentage: number;
}) {
  return Math.round(
    (input.priceAmount * input.requiredDepositPercentage) / 100,
  );
}

/**
 * The inscription's `Total`: the selected price minus the live
 * `Descuento por bailarín`, applied **exactly once**. There is no coalesce
 * against a frozen discount, and no third subtrahend.
 */
export function calculateTotalAmount(input: {
  priceAmount: number;
  dancerDiscountAmount: number;
}) {
  return input.priceAmount - input.dancerDiscountAmount;
}

/**
 * An inscription's state is its money against its two thresholds, nothing more.
 * With no applicable price there is no computable threshold, and an inscription
 * cannot have crossed a threshold that cannot be calculated: it reads
 * `depositPending`.
 */
export function deriveInscriptionFinancialStatus(input: {
  allocatedAmount: number;
  depositAmount: number | null;
  totalAmount: number | null;
}): InscriptionFinancialStatus {
  if (input.depositAmount === null || input.totalAmount === null) {
    return "depositPending";
  }

  if (input.allocatedAmount >= input.totalAmount) {
    return "paidInFull";
  }

  if (input.allocatedAmount >= input.depositAmount) {
    return "depositMet";
  }

  return "depositPending";
}

/**
 * Whether an inscription has crossed its deposit threshold — the moment its
 * price stops moving.
 *
 * The caller must pass the deposit derived from the **stored** price row and
 * never from an incoming or currently applicable one. The threshold is derived
 * *from* the price, so asking "has it crossed?" about an arbitrary price makes
 * the answer depend on which price is asked about: 1000 allocated is crossed
 * against a price of 3000 (deposit 900) and un-crossed against one of 10000
 * (deposit 3000). Testing against what is stored is what stops the rule being
 * circular.
 *
 * `null` is not crossed: a threshold that cannot be computed cannot have been
 * crossed, which is the same reading `deriveInscriptionFinancialStatus` takes.
 *
 * Money is required on top of the comparison, and only a deposit of zero can
 * tell the two apart. Zero is not reached through a zero percentage —
 * `MIN_REQUIRED_DEPOSIT_PERCENTAGE` is 1, and a price amount must be a positive
 * integer — but through a deposit that **rounds** to it: `calculateDepositAmount`
 * of a price of 1 at 1% is `Math.round(0.01)`, which is 0, and so is a price of
 * 4 at 10%. Without `allocatedAmount > 0` such a row would lock its price while
 * holding nothing, and the escape hatch out of a locked price is taking money
 * off — a lock that closes with no money on the row could never be opened again.
 */
export function hasCrossedDepositThreshold(input: {
  allocatedAmount: number;
  depositAmount: number | null;
}): boolean {
  if (input.depositAmount === null) {
    return false;
  }

  return (
    input.allocatedAmount > 0 && input.allocatedAmount >= input.depositAmount
  );
}

/**
 * Whether money leaving an inscription drops it **below** a threshold it had
 * crossed. It is the one reading the payment-deletion dialog counts: an
 * un-crossing never blocks anything, so all there is to do with it is state it.
 */
export function hasUncrossedThreshold(input: {
  after: InscriptionFinancialStatus;
  before: InscriptionFinancialStatus;
}): boolean {
  return statusOrder[input.after] < statusOrder[input.before];
}

/**
 * The four figures, the state and the anomalies of an inscription.
 *
 * `Seña adeudada` and `Saldo adeudado` are shortfalls against each threshold,
 * floored at zero; since `seña ≤ total`, `Seña adeudada ≤ Saldo adeudado`
 * always. They are gross: they net the inscription against **its own**
 * allocations, never against the academy's `Saldo disponible`.
 */
export function deriveInscriptionFinancialFigures(input: {
  allocatedAmount: number;
  thresholds: InscriptionThresholds;
  withdrawn?: boolean;
}): InscriptionFinancialFigures {
  if (input.withdrawn) {
    return deriveWithdrawnInscriptionFigures(input);
  }

  const { depositAmount, totalAmount } = input.thresholds;
  const financialStatus = deriveInscriptionFinancialStatus({
    allocatedAmount: input.allocatedAmount,
    depositAmount,
    totalAmount,
  });
  const overAllocatedAmount =
    totalAmount === null
      ? null
      : Math.max(0, input.allocatedAmount - totalAmount);

  return {
    allocatedAmount: input.allocatedAmount,
    anomalies: overAllocatedAmount ? ["overAllocated"] : [],
    depositAmount,
    financialStatus,
    overAllocatedAmount,
    owedBalanceAmount:
      totalAmount === null
        ? null
        : Math.max(0, totalAmount - input.allocatedAmount),
    owedDepositAmount:
      depositAmount === null
        ? null
        : Math.max(0, depositAmount - input.allocatedAmount),
    totalAmount,
  };
}

/**
 * A withdrawn inscription's total is **what remains allocated to it, not zero**:
 * the seña may be forfeited, and the allocation that stays is the record of that
 * retention. Money and obligation become one statement, and three consequences
 * fall out of that single rule rather than being enforced one by one:
 *
 * - `Sobreasignada` **cannot fire** — the excess is `allocated − total`, and here
 *   they are the same number by construction.
 * - **Nothing is owed.** The row is off the roster; there is no threshold left to
 *   reach.
 * - The retained money **re-enters the choreography's rollup**, because
 *   `totalAmount` and `allocatedAmount` are both real.
 *
 * The deposit figure survives untouched: the preset that takes the saldo off a
 * withdrawn row needs it, and it is the price's figure, not a claim.
 *
 * The status reads `paidInFull` because nothing is owed, but no surface shows it
 * — the `Retirada` badge replaces the status badge, and the rollup skips the row.
 * `paidInFull` is the harmless value to carry: it is the maximum of a minimum
 * rollup, so a leak could not drag a choreography down.
 */
function deriveWithdrawnInscriptionFigures(input: {
  allocatedAmount: number;
  thresholds: InscriptionThresholds;
}): InscriptionFinancialFigures {
  return {
    allocatedAmount: input.allocatedAmount,
    anomalies: [],
    depositAmount: input.thresholds.depositAmount,
    financialStatus: "paidInFull",
    overAllocatedAmount: 0,
    owedBalanceAmount: 0,
    owedDepositAmount: 0,
    totalAmount: input.allocatedAmount,
  };
}

/**
 * Which badge a row wears in the `Estado` column. The three axes do not sit side
 * by side: they **replace** each other, because two badges competing for the same
 * glance read as two facts of equal weight when only one asks for something.
 *
 * `Retirada` outranks everything: it is roster state, and the money axes describe
 * a row that is still on the roster. `Sobreasignada` cannot even co-occur with it
 * — see `deriveWithdrawnInscriptionFigures` — so the order is a statement, not a
 * tie-break.
 */
export type InscriptionStatusBadge =
  | { kind: "withdrawn" }
  | { kind: "anomaly"; anomaly: InscriptionAnomaly }
  | { kind: "status"; status: InscriptionFinancialStatus };

export function resolveInscriptionStatusBadge(input: {
  anomalies: InscriptionAnomaly[];
  financialStatus: InscriptionFinancialStatus;
  withdrawn?: boolean;
}): InscriptionStatusBadge {
  if (input.withdrawn) {
    return { kind: "withdrawn" };
  }

  const anomaly = inscriptionAnomalyPrecedence.find((candidate) =>
    input.anomalies.includes(candidate),
  );

  if (anomaly) {
    return { kind: "anomaly", anomaly };
  }

  return { kind: "status", status: input.financialStatus };
}

/**
 * A choreography's state is the **minimum** of its inscriptions, not a
 * high-water mark: a single uncovered inscription drags the whole choreography
 * down, because the badge answers *can it go on stage as choreographed?*.
 *
 * A choreography with no inscriptions cannot go on stage either:
 * `depositPending`.
 */
export function deriveChoreographyFinancialStatus(
  statuses: InscriptionFinancialStatus[],
): ChoreographyFinancialStatus {
  if (statuses.length === 0) {
    return "depositPending";
  }

  return statuses.reduce((lowest, status) =>
    statusOrder[status] < statusOrder[lowest] ? status : lowest,
  );
}

/**
 * The single owner of an inscription's money derivations: the three states, the
 * four figures and the anomaly array. No screen derives a threshold or a rollup
 * on its own again.
 *
 * Everything is derived on read against `Σ asignaciones`: nothing is written
 * when a threshold is crossed, and none of these figures is persisted.
 */

export type InscriptionFinancialStatus =
  "depositPending" | "depositMet" | "paidInFull" | "waived";

/**
 * The paying scale. `waived` (`Bonificada`, ADR-0017) is a fourth status that
 * sits **outside** it: a free inscription is neither behind nor ahead of a
 * paying one, so it is never compared with them.
 */
type ScaleFinancialStatus = Exclude<InscriptionFinancialStatus, "waived">;

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
const statusOrder: Record<ScaleFinancialStatus, number> = {
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
  /**
   * `Bonificada` (ADR-0017): both thresholds are zero whatever the price, and
   * the status reads `waived`. It travels with the thresholds so every reader
   * that resolves them hands it on without a second lookup.
   */
  waived?: boolean;
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

/** An inscription's price as the reglamento splits it (#674). */
export type InscriptionPriceSplit = {
  /** `Derecho de inscripción`: the deposit threshold, earned at registration. */
  registrationFeeAmount: number;
  /** `Derecho de participación`: the rest of the price, earned at the event. */
  participationFeeAmount: number;
};

/**
 * The price an academy is quoted before it registers, split into its two
 * components. The registration fee **is** `calculateDepositAmount`, never a
 * second percentage, and the participation fee is the remainder, so the two
 * always add up to the price. Like the deposit it is taken on the undiscounted
 * price.
 */
export function splitInscriptionPrice(input: {
  priceAmount: number;
  requiredDepositPercentage: number;
}): InscriptionPriceSplit {
  const registrationFeeAmount = calculateDepositAmount(input);

  return {
    registrationFeeAmount,
    participationFeeAmount: input.priceAmount - registrationFeeAmount,
  };
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
  if (input.after === "waived" || input.before === "waived") {
    return false;
  }

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

  if (input.thresholds.waived) {
    return deriveWaivedInscriptionFigures(input);
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
 * the deposit may be forfeited, and the allocation that stays is the record of that
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
 * The deposit figure survives untouched: the preset that takes the balance off a
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
 * What a withdrawn inscription **retains**: exactly its deposit, the price of the
 * `derecho de inscripción` the reglamento's clause says withdrawal never returns
 * (#674, #1065), or what it holds when that is less. The medical case needs no
 * branch: the administrator releases the deposit with `Quitar dinero`, the row
 * holds nothing, and it retains nothing.
 *
 * A row no price resolves for any more has no deposit to measure: it retains
 * what it holds, which credits less rather than more and never leaves the
 * unit's credit note waiting on a price nobody can set on a withdrawn row.
 *
 * It is what a withdrawal's credit note is measured by, `línea facturada −
 * retenido`. The row's `Total` above still reads everything it holds, so money
 * above the deposit shows on the row until it is released; #1065 releases it at
 * withdrawal, after which the two agree.
 */
export function deriveRetainedAmount(input: {
  allocatedAmount: number;
  depositAmount: number | null;
}): number {
  return input.depositAmount === null
    ? input.allocatedAmount
    : Math.min(input.allocatedAmount, input.depositAmount);
}

/**
 * A waived inscription (`Bonificada`) owes nothing: both thresholds are zero,
 * whatever its price. It holds no money either — waiving is refused while it
 * carries allocations, and nothing can be allocated to it — so any money that
 * slips past the guards through a race reads as `Sobreasignada`, the anomaly
 * that already means "money in the wrong place".
 */
function deriveWaivedInscriptionFigures(input: {
  allocatedAmount: number;
}): InscriptionFinancialFigures {
  return {
    allocatedAmount: input.allocatedAmount,
    anomalies: input.allocatedAmount > 0 ? ["overAllocated"] : [],
    depositAmount: 0,
    financialStatus: "waived",
    overAllocatedAmount: input.allocatedAmount,
    owedBalanceAmount: 0,
    owedDepositAmount: 0,
    totalAmount: 0,
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
 *
 * `Reservada` is a seminar's `Seña pendiente` that still holds a reserved place
 * (docs/domain/seminars.md, "The place"): it replaces that one status and no
 * other, so a covered deposit, an anomaly or a withdrawal reads as before.
 *
 * `Particular` is a linked individual's seminar inscription as an academy reads
 * it (ADR-0019): not the academy's to pay and carrying none of the individual's
 * money, so it outranks every money axis, which it has none of to show.
 */
export type InscriptionStatusBadge =
  | { kind: "linkedIndividual" }
  | { kind: "withdrawn" }
  | { kind: "anomaly"; anomaly: InscriptionAnomaly }
  | { kind: "reserved" }
  | { kind: "status"; status: InscriptionFinancialStatus };

export function resolveInscriptionStatusBadge(input: {
  anomalies: InscriptionAnomaly[];
  financialStatus: InscriptionFinancialStatus;
  linkedIndividual?: boolean;
  reserved?: boolean;
  withdrawn?: boolean;
}): InscriptionStatusBadge {
  if (input.linkedIndividual) {
    return { kind: "linkedIndividual" };
  }

  if (input.withdrawn) {
    return { kind: "withdrawn" };
  }

  const anomaly = inscriptionAnomalyPrecedence.find((candidate) =>
    input.anomalies.includes(candidate),
  );

  if (anomaly) {
    return { kind: "anomaly", anomaly };
  }

  if (input.reserved && input.financialStatus === "depositPending") {
    return { kind: "reserved" };
  }

  return { kind: "status", status: input.financialStatus };
}

/**
 * A choreography's badge as the academy sees it, on the portal's list and its
 * detail alike. `Retirada` **replaces** the financial status, it does not
 * accompany it: a withdrawn choreography is not taking part, and the two badges
 * side by side would read as two facts of equal weight. The anomalies are left
 * out on purpose — the academy is not shown `Sobreasignada`.
 */
export function resolvePortalChoreographyStatusBadge(input: {
  financialStatus: InscriptionFinancialStatus;
  withdrawn: boolean;
}): InscriptionStatusBadge {
  return resolveInscriptionStatusBadge({ ...input, anomalies: [] });
}

/**
 * A unit's state is the **minimum** of its inscriptions, not a high-water mark:
 * a single uncovered inscription drags the whole unit down, because the badge
 * answers *can this happen as registered?* — for a choreography, *can it go on
 * stage as choreographed?*, and for a `(seminar, academy)` pair, *does every
 * person the academy registered hold their place?*.
 *
 * A unit with no inscriptions cannot happen either: `depositPending`. One whose
 * roster emptied through withdrawals never gets here: the rollup reads it
 * `Retirada` (`rollUpInscriptionFinanceFigures`).
 *
 * Waived inscriptions stay out of the minimum: the unit is as far along as its
 * paying inscriptions. A unit whose every inscription is waived reads `waived`
 * itself.
 */
export function deriveMinimumFinancialStatus(
  statuses: InscriptionFinancialStatus[],
): InscriptionFinancialStatus {
  if (statuses.length === 0) {
    return "depositPending";
  }

  const paying = statuses.filter(
    (status): status is ScaleFinancialStatus => status !== "waived",
  );

  if (paying.length === 0) {
    return "waived";
  }

  return paying.reduce((lowest, status) =>
    statusOrder[status] < statusOrder[lowest] ? status : lowest,
  );
}

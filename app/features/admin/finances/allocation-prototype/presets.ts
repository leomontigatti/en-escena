/**
 * THROWAWAY PROTOTYPE — ticket #550 of map #547.
 *
 * `Pagar seña` and `Pagar saldo` as **presets over the figures** (#551), not as
 * rungs of a ladder: each one reads `owedDepositAmount` or `owedBalanceAmount`
 * off the chosen rows and builds an allocation plan.
 *
 * Rules the prototype puts on screen because they are decisions, not details:
 *
 * 1. **Nothing depends on the order the admin clicked in** (the map's standing
 *    preference). Rows are traversed by name and payments by number, so the same
 *    selection always produces the same plan. The admin never picks the payment:
 *    a preset draws from `Saldo disponible` and the fill rule does the rest.
 * 2. **A row with no price chosen cannot enter a preset**: without a price there
 *    is no figure to measure against. The preset sets those aside and counts
 *    them, rather than choosing a price on their behalf.
 */
import type { InscriptionReading, PaymentReading } from "./fixtures";

export type PresetKind = "deposit" | "balance";

export type PresetSkipReason = "alreadyMet";

export type PresetLine = {
  inscription: InscriptionReading;
  /** What the preset asks for on this row. */
  targetAmount: number;
  /** What actually gets allocated. Below the target when the money ran out. */
  amount: number;
  /** Breakdown by payment: each slice is one `(payment, inscription)` upsert. */
  fundedBy: { paymentId: string; paymentNumber: number; amount: number }[];
};

export type PresetPlan = {
  kind: PresetKind;
  lines: PresetLine[];
  skipped: { inscription: InscriptionReading; reason: PresetSkipReason }[];
  /** Sum of the targets of the eligible rows. */
  requestedAmount: number;
  /** Sum of what is about to be allocated. */
  fundedAmount: number;
  /** `requested - funded`. Above zero when the money does not cover it. */
  shortfallAmount: number;
  /** Chosen money left over once the plan is applied. */
  leftoverAmount: number;
};

export function presetTargetAmount(
  inscription: InscriptionReading,
  kind: PresetKind,
) {
  return kind === "deposit"
    ? inscription.owedDepositAmount
    : inscription.owedBalanceAmount;
}

export function buildPresetPlan({
  inscriptions,
  payments,
  kind,
}: {
  inscriptions: InscriptionReading[];
  payments: PaymentReading[];
  kind: PresetKind;
}): PresetPlan {
  const skipped: PresetPlan["skipped"] = [];
  const eligible: { inscription: InscriptionReading; targetAmount: number }[] =
    [];

  // Deterministic order by name: the plan cannot depend on click order.
  const ordered = [...inscriptions].sort((left, right) =>
    left.dancerName.localeCompare(right.dancerName, "es-AR"),
  );

  for (const inscription of ordered) {
    const targetAmount = presetTargetAmount(inscription, kind);

    if (targetAmount === 0) {
      skipped.push({ inscription, reason: "alreadyMet" });
      continue;
    }

    eligible.push({ inscription, targetAmount });
  }

  const requestedAmount = eligible.reduce(
    (total, row) => total + row.targetAmount,
    0,
  );
  // Payments oldest first, the same fill rule `spreadFromPool` uses for a single
  // manual allocation — never selection order, never size.
  const purse = [...payments]
    .sort((left, right) => left.number - right.number)
    .map((payment) => ({
      id: payment.id,
      number: payment.number,
      remaining: payment.availableAmount,
    }));

  const lines = eligible.map(({ inscription, targetAmount }) => {
    const fundedBy: PresetLine["fundedBy"] = [];
    let pending = targetAmount;

    for (const source of purse) {
      if (pending === 0 || source.remaining === 0) {
        continue;
      }

      const taken = Math.min(pending, source.remaining);
      source.remaining -= taken;
      pending -= taken;
      fundedBy.push({
        paymentId: source.id,
        paymentNumber: source.number,
        amount: taken,
      });
    }

    return {
      inscription,
      targetAmount,
      amount: targetAmount - pending,
      fundedBy,
    };
  });

  const fundedAmount = lines.reduce((total, line) => total + line.amount, 0);

  return {
    kind,
    lines,
    skipped,
    requestedAmount,
    fundedAmount,
    shortfallAmount: requestedAmount - fundedAmount,
    leftoverAmount: purse.reduce(
      (total, source) => total + source.remaining,
      0,
    ),
  };
}

/**
 * The plan as absolute upserts: `onAllocate` overwrites the amount on
 * `(payment, inscription)`, so whatever that row already held from the same
 * payment has to be added in.
 */
export function planUpserts(plan: PresetPlan) {
  return plan.lines.flatMap((line) =>
    line.fundedBy.map((source) => {
      const existing =
        line.inscription.allocations.find(
          (allocation) => allocation.paymentId === source.paymentId,
        )?.amount ?? 0;

      return {
        paymentId: source.paymentId,
        inscriptionId: line.inscription.id,
        amount: existing + source.amount,
      };
    }),
  );
}

export const presetLabels = {
  deposit: "Pagar seña",
  balance: "Pagar saldo",
} as const satisfies Record<PresetKind, string>;

export const skipReasonLabels = {
  alreadyMet: "ya cubierta",
} as const satisfies Record<PresetSkipReason, string>;

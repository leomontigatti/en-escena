/**
 * What a `Pagar seña` or `Pagar saldo` charge comes to on one inscription, of
 * either kind, read with no database so the write and what a screen projects
 * from it cannot disagree.
 */

import type { CobroStage } from "@/lib/finances/choreography-cobro-presets.server";
import {
  calculateDepositAmount,
  calculateTotalAmount,
  deriveInscriptionFinancialFigures,
  hasCrossedDepositThreshold,
} from "@/lib/finances/inscription-financial-status";

export type ThresholdChargePlan = {
  /** The charge carries the inscription across its deposit, or its money
   * already reaches the deposit of a row that is not fixed yet: either way this
   * row is the one it ends up frozen at. */
  crossesDeposit: boolean;
  /** The charge split into what the pool is asked for, in order. The crossing
   * comes first and alone: the pool checks a move against the **effective** row,
   * which below the deposit is today's and only past it the row priced here. */
  moves: number[];
  /** What the inscription holds past the row's total. */
  overAllocatedAmount: number;
  /** `null` only when no row prices the charge. */
  owedAmount: number | null;
};

/**
 * The charge against the stage, priced by `priceRow`: **the row the charge
 * prices with**, which is the one the inscription holds once the write is done,
 * and not the effective one.
 *
 * `covered` is whether the row the inscription stores had its deposit crossed
 * before this charge. `dancerDiscountAmount` is the live `Descuento por bailarín`
 * of the row, which only a choreography inscription has and which leaves the
 * deposit alone.
 */
export function planThresholdCharge(input: {
  allocatedAmount: number;
  covered: boolean;
  dancerDiscountAmount?: number;
  priceRow: { amount: number } | null;
  requiredDepositPercentage: number;
  stage: CobroStage;
}): ThresholdChargePlan {
  const { allocatedAmount, priceRow, requiredDepositPercentage } = input;
  const depositAmount = priceRow
    ? calculateDepositAmount({
        priceAmount: priceRow.amount,
        requiredDepositPercentage,
      })
    : null;
  const figures = deriveInscriptionFinancialFigures({
    allocatedAmount,
    thresholds: {
      depositAmount,
      totalAmount: priceRow
        ? calculateTotalAmount({
            dancerDiscountAmount: input.dancerDiscountAmount ?? 0,
            priceAmount: priceRow.amount,
          })
        : null,
    },
  });

  if (depositAmount === null || figures.owedBalanceAmount === null) {
    return {
      crossesDeposit: false,
      moves: [],
      overAllocatedAmount: 0,
      owedAmount: null,
    };
  }

  // Only money crosses a deposit, so one that rounds to zero still takes a peso.
  const toDeposit = Math.max(Math.max(depositAmount, 1) - allocatedAmount, 0);
  const owedAmount =
    input.stage === "deposit" ? toDeposit : figures.owedBalanceAmount;
  const crossesDeposit =
    !input.covered &&
    hasCrossedDepositThreshold({
      allocatedAmount: allocatedAmount + owedAmount,
      depositAmount,
    });

  return {
    crossesDeposit,
    moves: fundingMoves({ crossesDeposit, owedAmount, toDeposit }),
    overAllocatedAmount: figures.overAllocatedAmount ?? 0,
    owedAmount,
  };
}

function fundingMoves(input: {
  crossesDeposit: boolean;
  owedAmount: number;
  toDeposit: number;
}): number[] {
  const { crossesDeposit, owedAmount, toDeposit } = input;

  if (crossesDeposit && toDeposit > 0 && toDeposit < owedAmount) {
    return [toDeposit, owedAmount - toDeposit];
  }

  return owedAmount > 0 ? [owedAmount] : [];
}

/**
 * What the preset dialog *says* about the money, with none of how it looks: what
 * the selection owes against the prices currently picked, and how the row that
 * keeps the price in force reads.
 *
 * It sits beside `preset-dialog.tsx` rather than inside it because none of it is
 * UI, exactly as `inscription-money-figures.ts` sits beside the single
 * inscription's dialog: every function here is a pure reading of loader rows,
 * which is what makes the dialog's arithmetic testable without mounting a dialog.
 */

import type { CobroStage } from "@/lib/finances/choreography-cobro-presets.server";
import { formatAmount } from "@/lib/finances/formatters";
import {
  calculateTotalAmount,
  deriveInscriptionFinancialFigures,
  hasCrossedDepositThreshold,
} from "@/lib/finances/inscription-financial-status";
import {
  buildOperationalFinanceAmount,
  type OperationalFinanceAmount,
} from "@/lib/finances/operational-summary";

import { keepCurrentPriceLabel, type PresetPriceOption } from "./presets";

/**
 * An inscription of the academy, as much of it as the dialog's projection needs.
 * It is the shape the loader trims `ResolvedInscription` down to: the figures
 * already derived, plus what it takes to re-derive them against another price.
 */
export type PresetInscription = {
  allocatedAmount: number;
  basePriceAmount: number | null;
  basePriceId: string | null;
  choreographyId: string;
  dancerDiscountAmount: number;
  depositAmount: number | null;
  id: string;
  owedBalanceAmount: number | null;
  owedDepositAmount: number | null;
  withdrawn: boolean;
};

/**
 * What the selection owes against the stage, projected through the prices picked
 * right now. With nothing picked it is the loader's own figures summed, which is
 * the same number the choreography rows carry.
 *
 * It sums the inscriptions rather than the choreography rows because a pick does
 * not reach all of them — it stops at the ones that have covered their deposit —
 * and a row is only as re-priceable as its inscriptions individually are.
 */
export function sumPresetOwedAmount(input: {
  groupTypeByChoreography: Record<string, string>;
  inscriptions: PresetInscription[];
  pickedPriceByGroupType: Record<string, PresetPriceOption>;
  stage: CobroStage;
}): OperationalFinanceAmount {
  let amount = 0;
  let missingPriceCount = 0;

  for (const inscription of input.inscriptions) {
    const groupType = input.groupTypeByChoreography[inscription.choreographyId];
    const owed = resolvePresetOwedAmount({
      inscription,
      price: (groupType && input.pickedPriceByGroupType[groupType]) || null,
      stage: input.stage,
    });

    if (owed === null) {
      missingPriceCount++;
      continue;
    }

    amount += owed;
  }

  return buildOperationalFinanceAmount({ amount, missingPriceCount });
}

/**
 * One inscription's shortfall against the stage, re-derived when the pick would
 * actually reach it and read off the loader when it would not. The three cases
 * that keep the loader's figure are the writer's own (`applySelectedPrices`): no
 * pick for that group type, a row off the roster, and an inscription that has
 * covered its deposit — which is the crossing that fixes the price.
 *
 * Two deliberate approximations, both the same ones the single inscription's
 * dialog makes. The crossing is tested against the **effective** deposit while
 * the writer tests the **stored** one, which can only differ when the price list
 * moved down under a row holding money, and errs on the strict side. And the
 * `Descuento por bailarín` is the row's own: it is derived from the roster's
 * prices, so a pick moves it, but the projection keeps it rather than re-deriving
 * a discount across the whole academy. The write recomputes both.
 */
function resolvePresetOwedAmount(input: {
  inscription: PresetInscription;
  price: PresetPriceOption | null;
  stage: CobroStage;
}): number | null {
  const { inscription, price } = input;
  const keepsItsPrice =
    price === null ||
    inscription.withdrawn ||
    hasCrossedDepositThreshold({
      allocatedAmount: inscription.allocatedAmount,
      depositAmount: inscription.depositAmount,
    });

  if (keepsItsPrice) {
    return input.stage === "deposit"
      ? inscription.owedDepositAmount
      : inscription.owedBalanceAmount;
  }

  const figures = deriveInscriptionFinancialFigures({
    allocatedAmount: inscription.allocatedAmount,
    thresholds: {
      depositAmount: price.depositAmount,
      totalAmount: calculateTotalAmount({
        dancerDiscountAmount: inscription.dancerDiscountAmount,
        priceAmount: price.amount,
      }),
    },
  });

  return input.stage === "deposit"
    ? figures.owedDepositAmount
    : figures.owedBalanceAmount;
}

/**
 * How the default row reads: `Mantener el precio actual`, and the price it means
 * whenever the inscriptions it covers agree on one. Naming it is what turns the
 * default from a promise into a figure — an administrator who opens the picker to
 * find out what they are keeping should not have to close it and go read the
 * list.
 *
 * They are named by the row when they share it and by the amount when they only
 * share that, which is the case of a selection spanning schedules whose
 * schedule-bound row is not on offer. Sharing neither is left unnamed rather than
 * summarised: `varios precios` is what the plain label already says.
 */
export function formatKeepCurrentPriceLabel(input: {
  inscriptions: PresetInscription[];
  options: PresetPriceOption[];
}): string {
  const priceIds = new Set(
    input.inscriptions.map((inscription) => inscription.basePriceId),
  );

  if (priceIds.size === 1) {
    const option = input.options.find(
      (candidate) => candidate.id === [...priceIds][0],
    );

    if (option) {
      return `${keepCurrentPriceLabel} · ${option.name} · ${formatAmount(option.amount)}`;
    }
  }

  const amounts = new Set(
    input.inscriptions.map((inscription) => inscription.basePriceAmount),
  );
  const amount = amounts.size === 1 ? [...amounts][0] : null;

  return amount === null
    ? keepCurrentPriceLabel
    : `${keepCurrentPriceLabel} · ${formatAmount(amount)}`;
}

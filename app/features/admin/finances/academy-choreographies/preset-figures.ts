/**
 * What the preset dialog *says* about the money, with none of how it looks: what
 * the selection owes against the prices currently picked, and which row the
 * picker opens on.
 *
 * It sits beside `preset-dialog.tsx` rather than inside it because none of it is
 * UI, exactly as `inscription-money-figures.ts` sits beside the single
 * inscription's dialog: every function here is a pure reading of loader rows,
 * which is what makes the dialog's arithmetic testable without mounting a dialog.
 */

import type { CobroStage } from "@/lib/finances/choreography-cobro-presets.server";
import {
  calculateTotalAmount,
  deriveInscriptionFinancialFigures,
  hasCrossedDepositThreshold,
} from "@/lib/finances/inscription-financial-status";
import {
  buildOperationalFinanceAmount,
  type OperationalFinanceAmount,
} from "@/lib/finances/operational-summary";

import type { PresetPriceOption } from "./presets";

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

  if (price === null || !canBeRePriced(inscription)) {
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
 * The row the picker opens on: the price that applies **today** to the
 * inscriptions a pick would reach, when they all resolve to the same one and it
 * is among the rows on offer.
 *
 * It is read off the inscriptions the pick reaches and not off all of them. One
 * that has covered its deposit is on the row that crossing fixed, which can be
 * an older one; letting it break the agreement would empty a picker whose
 * default it is not even affected by.
 *
 * `null` is a picker that opens on its placeholder, which happens when those
 * inscriptions sit on different rows — a selection spanning schedules — or when
 * the row in force is not offered, and submitting it leaves every price where it
 * is. It is the honest empty: there is no single price today to open on.
 */
export function resolveCurrentPriceId(input: {
  inscriptions: PresetInscription[];
  options: PresetPriceOption[];
}): string | null {
  const priceIds = new Set(
    input.inscriptions
      .filter(canBeRePriced)
      .map((inscription) => inscription.basePriceId),
  );

  if (priceIds.size !== 1) {
    return null;
  }

  const priceId = [...priceIds][0];

  return input.options.some((option) => option.id === priceId) ? priceId : null;
}

/**
 * Whether a pick would reach any of these inscriptions at all.
 *
 * A group type whose inscriptions have all covered their deposit has nothing
 * left to re-price, so a picker over it would ask a question no answer changes:
 * every row leaves the same prices in place. The dialog says so instead of
 * offering one.
 */
export function hasRePriceableInscription(
  inscriptions: PresetInscription[],
): boolean {
  return inscriptions.some(canBeRePriced);
}

/**
 * Whether a pick reaches an inscription at all, which is the writer's own rule:
 * off the roster it is not touched, and once its deposit is covered its price is
 * fixed — money on the row does not fix it, only the crossing does.
 */
function canBeRePriced(inscription: PresetInscription): boolean {
  return (
    !inscription.withdrawn &&
    !hasCrossedDepositThreshold({
      allocatedAmount: inscription.allocatedAmount,
      depositAmount: inscription.depositAmount,
    })
  );
}

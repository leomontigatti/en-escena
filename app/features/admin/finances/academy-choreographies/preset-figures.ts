/**
 * What the preset dialog *says* about the money, with none of how it looks: what
 * the selection owes against the prices currently picked, and which row the
 * picker opens on.
 *
 * It sits beside `preset-dialog.tsx` rather than inside it because none of it is
 * UI, exactly as `inscription-money/figures.ts` sits beside the single
 * inscription's dialog: every function here is a pure reading of loader rows,
 * which is what makes the dialog's arithmetic testable without mounting a dialog.
 */

import type { CobroStage } from "@/lib/finances/choreography-cobro-presets.server";
import {
  hasCrossedDepositThreshold,
  type InscriptionFinancialStatus,
} from "@/lib/finances/inscription-financial-status";
import {
  buildOperationalFinanceAmount,
  type OperationalFinanceAmount,
} from "@/lib/finances/operational-summary";
import { planThresholdCharge } from "@/lib/finances/threshold-charge";

import type { PresetPriceOption } from "./presets";

/**
 * An inscription of the academy, as much of it as the dialog's projection needs.
 * It is the shape the loader trims `ResolvedInscription` down to: the figures
 * already derived, plus what it takes to re-derive them against another price.
 *
 * `storedPriceAmount` and `storedDepositAmount` are the row the inscription
 * **stores**, `null` with none stored: the one a pick is tested against and the
 * one the write charges with no pick. The effective row is not it: below the
 * stored deposit that is today's row.
 */
export type PresetInscription = {
  allocatedAmount: number;
  basePriceAmount: number | null;
  basePriceId: string | null;
  choreographyId: string;
  dancerDiscountAmount: number;
  // Required, so a loader that drops it fails to typecheck: without it a
  // waived inscription would be re-priced in the projection.
  financialStatus: InscriptionFinancialStatus;
  id: string;
  owedBalanceAmount: number | null;
  owedDepositAmount: number | null;
  storedDepositAmount: number | null;
  storedPriceAmount: number | null;
  withdrawn: boolean;
};

/**
 * What the selection owes against the stage, projected through the prices picked
 * right now. With nothing picked it is what the write charges at the row stored,
 * or at the price in effect with none, which is the number the choreography rows
 * carry except on a deposit that rounds to zero or a stored row below its deposit.
 *
 * It sums the inscriptions rather than the choreography rows because a pick does
 * not reach all of them — it stops at the ones that have covered their deposit —
 * and a row is only as re-priceable as its inscriptions individually are.
 */
export function sumPresetOwedAmount(input: {
  groupTypeByChoreography: Record<string, string>;
  inscriptions: PresetInscription[];
  pickedPriceByGroupType: Record<string, PresetPriceOption>;
  requiredDepositPercentage: number;
  stage: CobroStage;
}): OperationalFinanceAmount {
  let amount = 0;
  let missingPriceCount = 0;

  for (const inscription of input.inscriptions) {
    const groupType = input.groupTypeByChoreography[inscription.choreographyId];
    const owed = resolvePresetOwedAmount({
      inscription,
      price: (groupType && input.pickedPriceByGroupType[groupType]) || null,
      requiredDepositPercentage: input.requiredDepositPercentage,
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
 * One inscription's shortfall against the stage, planned as the writer plans it:
 * at the picked row when the pick reaches it, and otherwise at the row it stores,
 * or at the price in effect with none stored. What the write skips keeps the
 * loader's figure: a row off the roster and a waived one.
 *
 * One deliberate approximation: the `Descuento por bailarín` is the row's own.
 * It is derived from the roster's prices, so a pick moves it, but the projection
 * keeps it rather than re-deriving a discount across the whole academy. The
 * write recomputes it.
 */
function resolvePresetOwedAmount(input: {
  inscription: PresetInscription;
  price: PresetPriceOption | null;
  requiredDepositPercentage: number;
  stage: CobroStage;
}): number | null {
  const { inscription, price } = input;

  if (!takesCharges(inscription)) {
    return input.stage === "deposit"
      ? inscription.owedDepositAmount
      : inscription.owedBalanceAmount;
  }

  return planThresholdCharge({
    allocatedAmount: inscription.allocatedAmount,
    // Decides the crossing and its moves, which this figure does not read.
    covered: false,
    dancerDiscountAmount: inscription.dancerDiscountAmount,
    priceRow:
      price !== null && canBeRePriced(inscription)
        ? price
        : chargedRowWithoutPick(inscription),
    requiredDepositPercentage: input.requiredDepositPercentage,
    stage: input.stage,
  }).owedAmount;
}

function chargedRowWithoutPick(inscription: PresetInscription) {
  const amount = inscription.storedPriceAmount ?? inscription.basePriceAmount;

  return amount === null ? null : { amount };
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

/** Off the roster a row is not touched, and a waived one owes nothing whatever
 * its price. */
function takesCharges(inscription: PresetInscription): boolean {
  return !inscription.withdrawn && inscription.financialStatus !== "waived";
}

/**
 * Whether a pick reaches an inscription at all, which is the writer's own rule:
 * once the deposit of the row it stores is covered its price is fixed — money on
 * the row does not fix it, only the crossing does.
 */
function canBeRePriced(inscription: PresetInscription): boolean {
  return (
    takesCharges(inscription) &&
    !hasCrossedDepositThreshold({
      allocatedAmount: inscription.allocatedAmount,
      depositAmount: inscription.storedDepositAmount,
    })
  );
}

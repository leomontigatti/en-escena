/**
 * What the money dialog *says*, with none of how it looks: which shape a row
 * opens on, which price the figures are derived against, what the inscription
 * owes against that price, and how the two read on screen.
 *
 * It sits beside `dialog.tsx` rather than inside it because none of it is UI:
 * every function here is a pure reading of a row, which is what makes the
 * dialog's arithmetic testable without mounting a dialog.
 */

import {
  calculateTotalAmount,
  deriveInscriptionFinancialFigures,
  hasCrossedDepositThreshold,
} from "@/lib/finances/inscription-financial-status";

import { formatAmount } from "@/lib/finances/formatters";

/**
 * A price row as the dialog reads it — name, amount and the `Seña` it implies.
 * The shape is structural rather than a loader's slice because **both kinds of
 * inscription open the same dialog**: the choreography detail and the
 * `(seminar, academy)` one each build their options from their own price list,
 * and what the dialog needs of a row is the same three figures either way.
 */
export type PriceOption = {
  amount: number;
  depositAmount: number;
  id: string;
  name: string;
};

/**
 * The row the dialog is about, of either kind. `dancerDiscountAmount` is a
 * constant zero on the seminar side — a seminar has no `Descuento por
 * bailarín` — and travels all the same, because the owed figures are derived
 * through the one owner that takes it as an input.
 */
export type InscriptionRow = {
  allocatedAmount: number;
  dancerDiscountAmount: number;
  depositAmount: number | null;
  effectivePrice: PriceOption | null;
  firstName: string;
  /** `null` for a roster person with no inscription yet: nothing to fund. */
  inscriptionId: string | null;
  lastName: string;
  overAllocatedAmount: number | null;
  owedBalanceAmount: number | null;
  owedDepositAmount: number | null;
};

export type InscriptionMoneyDialogShape =
  | "releaseExcess"
  | "remove"
  | "allocate";

export type OwedAgainstPrice = {
  owedBalanceAmount: number | null;
  owedDepositAmount: number | null;
};

/**
 * Which shape the row opens on. The excess outranks everything: an
 * over-allocated row is fully paid too, and the only sane act on it is getting
 * the surplus off. A row that owes nothing and holds money opens on removal,
 * because allocating onto it would be refused.
 */
export function readInscriptionMoneyDialogShape(
  inscription: Pick<
    InscriptionRow,
    "allocatedAmount" | "overAllocatedAmount" | "owedBalanceAmount"
  >,
): InscriptionMoneyDialogShape {
  if ((inscription.overAllocatedAmount ?? 0) > 0) {
    return "releaseExcess";
  }

  return inscription.owedBalanceAmount === 0 && inscription.allocatedAmount > 0
    ? "remove"
    : "allocate";
}

/**
 * The price the dialog is currently about: the picked row while the picker is
 * live, and the effective one otherwise. The fallback is not only for the locked
 * shape — a row whose effective price is not among the offered options would
 * leave the picker empty, and the figures still have to come from somewhere.
 */
function selectPickedPrice(input: {
  inscription: InscriptionRow;
  priceId: string;
  priceOptions: PriceOption[];
}): PriceOption | null {
  return (
    input.priceOptions.find((price) => price.id === input.priceId) ??
    input.inscription.effectivePrice
  );
}

/**
 * What the inscription would owe against a given price, through the same owner
 * every other surface derives with. The `Descuento por bailarín` is the row's
 * own and does not move with the price, so it applies to whichever one is
 * picked.
 *
 * With no price there is no threshold to owe against, and the loader's own
 * figures —both `null` in that case— are what the dialog keeps saying.
 */
function deriveOwedAgainstPrice(input: {
  inscription: InscriptionRow;
  price: PriceOption | null;
}): OwedAgainstPrice {
  if (input.price === null) {
    return {
      owedBalanceAmount: input.inscription.owedBalanceAmount,
      owedDepositAmount: input.inscription.owedDepositAmount,
    };
  }

  const figures = deriveInscriptionFinancialFigures({
    allocatedAmount: input.inscription.allocatedAmount,
    thresholds: {
      depositAmount: input.price.depositAmount,
      totalAmount: calculateTotalAmount({
        dancerDiscountAmount: input.inscription.dancerDiscountAmount,
        priceAmount: input.price.amount,
      }),
    },
  });

  return {
    owedBalanceAmount: figures.owedBalanceAmount,
    owedDepositAmount: figures.owedDepositAmount,
  };
}

/**
 * How a price row reads in the dialog, picker and readout alike: name, amount
 * and the `Seña` it implies. One formatter for both, so locking a row cannot
 * quietly drop a figure the administrator was choosing by.
 *
 * The row it is given is the **effective** one — what the inscription is charged
 * at — and never the stored one, so it cannot show a figure the detail row
 * behind it contradicts.
 */
export function formatDialogPrice(price: PriceOption | null) {
  return price === null
    ? "Sin precio"
    : `${price.name} · ${formatAmount(price.amount)} · seña ${formatAmount(price.depositAmount)}`;
}

export function formatOwedAmount(amount: number | null) {
  return amount === null ? "Sin precio" : formatAmount(amount);
}

/** Every figure the allocation shape reads, against the price currently picked. */
export type AllocationDialogFigures = OwedAgainstPrice & {
  /** The figure that finishes the next thing: the deposit while that threshold
   * is unmet, the balance once it is met. */
  hintedAmount: number | null;
  /** The picker locks where the rule locks it: on covering the deposit, not on
   * the first peso. */
  isPriceLocked: boolean;
};

/**
 * The allocation shape's arithmetic in one call. Every figure follows the
 * **picked** price and not the row's, because confirming applies the pick:
 * hinting the deposit of a price the administrator just moved away from asks
 * them to type a figure the dialog is not about to charge.
 */
export function resolveAllocationDialogFigures(input: {
  inscription: InscriptionRow;
  priceId: string;
  priceOptions: PriceOption[];
}): AllocationDialogFigures {
  const owed = deriveOwedAgainstPrice({
    inscription: input.inscription,
    price: selectPickedPrice(input),
  });

  return {
    ...owed,
    hintedAmount:
      owed.owedDepositAmount === null || owed.owedDepositAmount > 0
        ? owed.owedDepositAmount
        : owed.owedBalanceAmount,
    isPriceLocked: hasCrossedDepositThreshold({
      allocatedAmount: input.inscription.allocatedAmount,
      depositAmount: input.inscription.depositAmount,
    }),
  };
}

/**
 * Out of range is `< 1` or above the ceiling, and an empty box is not out of
 * range — it is the state the field opens in. With no ceiling known there is
 * nothing to be outside of.
 */
export function isAmountOutOfRange(amount: string, maxAmount: number | null) {
  return (
    amount !== "" &&
    maxAmount !== null &&
    (Number(amount) < 1 || Number(amount) > maxAmount)
  );
}

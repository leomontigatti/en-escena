/**
 * What the money dialog *says*, with none of how it looks: which shape a row
 * opens on, which price the figures are derived against, what the inscription
 * owes against that price, and how the two read on screen.
 *
 * It sits beside `inscription-money-dialog.tsx` rather than inside it because
 * none of it is UI: every function here is a pure reading of a loader row, which
 * is what makes the dialog's arithmetic testable without mounting a dialog.
 */

import {
  calculateTotalAmount,
  deriveInscriptionFinancialFigures,
} from "@/lib/finances/inscription-financial-status";

import { formatAmount } from "@/lib/finances/formatters";
import type { loadChoreographyFinanceDetail } from "./server";

type ChoreographyFinanceDetailLoaderData = Awaited<
  ReturnType<typeof loadChoreographyFinanceDetail>
>;

export type InscriptionRow =
  ChoreographyFinanceDetailLoaderData["inscriptions"][number];
export type PriceOption =
  ChoreographyFinanceDetailLoaderData["priceOptions"][number];

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
export function selectPickedPrice(input: {
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
export function deriveOwedAgainstPrice(input: {
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
        dancerDiscountAmount: input.inscription.discountAmount,
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

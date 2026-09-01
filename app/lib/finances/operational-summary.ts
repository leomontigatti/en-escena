export type OperationalFinanceAmount =
  | {
      amount: number;
      status: "complete";
    }
  | {
      amount: number;
      missingPriceCount: number;
      status: "incomplete";
    };

export type OperationalFinanceSummary = {
  availableBalanceAmount: number;
  // `Seña` and `Total`: the academy's two thresholds, summed over its
  // choreographies. They are context —what the owed figures are measured
  // against— and not debt.
  depositAmount: OperationalFinanceAmount;
  totalAmount: OperationalFinanceAmount;
  // `Saldo adeudado`: gross, the sum of each inscription's shortfall against its
  // total. It does not subtract `Saldo disponible`.
  owedBalanceAmount: OperationalFinanceAmount;
  // `Seña adeudada`: gross, the sum of each inscription's shortfall against its
  // deposit. Contained in `Saldo adeudado`, never its complement.
  owedDepositAmount: OperationalFinanceAmount;
  totalPaidAmount: number;
};

export function completeOperationalFinanceAmount(
  amount: number,
): OperationalFinanceAmount {
  return {
    amount,
    status: "complete",
  };
}

export function incompleteOperationalFinanceAmount(input: {
  amount: number;
  missingPriceCount: number;
}): OperationalFinanceAmount {
  return {
    amount: input.amount,
    missingPriceCount: input.missingPriceCount,
    status: "incomplete",
  };
}

export function buildOperationalFinanceAmount(input: {
  amount: number;
  missingPriceCount: number;
}): OperationalFinanceAmount {
  if (input.missingPriceCount > 0) {
    return incompleteOperationalFinanceAmount(input);
  }

  return completeOperationalFinanceAmount(input.amount);
}

/**
 * Adds operational figures propagating incompleteness: if any of them is
 * missing its price, so is the sum. It lives here and not in the server's
 * calculations because the academy's view redoes the same sum over the
 * selection, and two different sums for the same figure end up disagreeing.
 */
export function sumOperationalFinanceAmounts(
  amounts: OperationalFinanceAmount[],
): OperationalFinanceAmount {
  return buildOperationalFinanceAmount(
    amounts.reduce(
      (total, amount) => ({
        amount: total.amount + amount.amount,
        missingPriceCount:
          total.missingPriceCount +
          (amount.status === "incomplete" ? amount.missingPriceCount : 0),
      }),
      {
        amount: 0,
        missingPriceCount: 0,
      },
    ),
  );
}

export function emptyOperationalFinanceSummary(): OperationalFinanceSummary {
  return {
    availableBalanceAmount: 0,
    depositAmount: completeOperationalFinanceAmount(0),
    totalAmount: completeOperationalFinanceAmount(0),
    owedBalanceAmount: completeOperationalFinanceAmount(0),
    owedDepositAmount: completeOperationalFinanceAmount(0),
    totalPaidAmount: 0,
  };
}

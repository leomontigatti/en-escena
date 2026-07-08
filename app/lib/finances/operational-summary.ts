export type ChoreographyFinancialState = "impaga" | "pagada" | "señada";

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
  owedAmount: OperationalFinanceAmount;
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

export function emptyOperationalFinanceSummary(): OperationalFinanceSummary {
  return {
    availableBalanceAmount: 0,
    owedAmount: completeOperationalFinanceAmount(0),
    owedDepositAmount: completeOperationalFinanceAmount(0),
    totalPaidAmount: 0,
  };
}

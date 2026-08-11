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
  // `Seña` y `Total`: los dos umbrales de la academia, sumados sobre sus
  // coreografías. Son contexto —contra qué se mide lo adeudado—, no deuda.
  depositAmount: OperationalFinanceAmount;
  totalAmount: OperationalFinanceAmount;
  // `Saldo adeudado`: bruto, suma del faltante de cada inscripción contra su
  // total. No descuenta `Saldo disponible`.
  owedBalanceAmount: OperationalFinanceAmount;
  // `Seña adeudada`: bruto, suma del faltante de cada inscripción contra su
  // seña. Contenida en `Saldo adeudado`, nunca su complemento.
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
    depositAmount: completeOperationalFinanceAmount(0),
    totalAmount: completeOperationalFinanceAmount(0),
    owedBalanceAmount: completeOperationalFinanceAmount(0),
    owedDepositAmount: completeOperationalFinanceAmount(0),
    totalPaidAmount: 0,
  };
}

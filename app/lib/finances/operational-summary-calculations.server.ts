import { prices } from "@/db/schema";
import {
  completeOperationalFinanceAmount,
  type ChoreographyFinancialState,
  incompleteOperationalFinanceAmount,
  type OperationalFinanceAmount,
  type OperationalFinanceSummary,
} from "@/lib/finances/operational-summary";
import { calculateDepositAmount } from "@/lib/finances/choreography-invoices.server";
import { selectApplicablePriceFromCandidates } from "@/lib/prices/repository.server";

type FinancePriceRow = typeof prices.$inferSelect;
type FinanceAmountResolution =
  | {
      amount: number;
      status: "complete";
    }
  | {
      status: "missing-price";
    };

export type ChoreographyGroupType = "solo" | "duo" | "trio" | "grupal";

export type FinanceChoreographyRow = {
  academyId: string;
  choreographyScheduleId: string | null;
  groupType: ChoreographyGroupType;
  id: string;
  name: string;
  scheduleCapacityScheduleId: string | null;
};

export type FinanceInvoiceRow = {
  academyId: string;
  basePriceAmount: number;
  choreographyId: string;
  depositCompletedOn: string | null;
  id: string;
  invoiceAmount: number;
  invoiceType: "saldo" | "sena";
};

export type ChoreographyOperationalFinanceRow = {
  basePriceAmount: OperationalFinanceAmount;
  depositAmount: OperationalFinanceAmount;
  depositCompletedOn: string | null;
  financialState: ChoreographyFinancialState;
  groupType: ChoreographyGroupType;
  id: string;
  name: string;
  owedAmount: OperationalFinanceAmount;
  owedDepositAmount: OperationalFinanceAmount;
  paidAmount: number;
};

export function buildOperationalFinanceSummary(input: {
  academyId: string;
  choreographyRows: FinanceChoreographyRow[];
  financialStates: Map<string, ChoreographyFinancialState>;
  imputationAmountsByAcademy: Map<string, number>;
  invoiceImputedAmounts: Map<string, number>;
  invoiceRows: FinanceInvoiceRow[];
  paymentAmountsByAcademy: Map<string, number>;
  priceRows: FinancePriceRow[];
  requiredDepositPercentage: number;
}): OperationalFinanceSummary {
  const totalPaidAmount =
    input.paymentAmountsByAcademy.get(input.academyId) ?? 0;
  const totalImputedAmount =
    input.imputationAmountsByAcademy.get(input.academyId) ?? 0;
  const availableBalanceAmount = totalPaidAmount - totalImputedAmount;
  const choreographyFinanceRows = buildChoreographyOperationalFinanceRows({
    academyId: input.academyId,
    choreographyRows: input.choreographyRows,
    financialStates: input.financialStates,
    invoiceImputedAmounts: input.invoiceImputedAmounts,
    invoiceRows: input.invoiceRows,
    priceRows: input.priceRows,
    requiredDepositPercentage: input.requiredDepositPercentage,
  });

  return buildOperationalFinanceSummaryFromChoreographyRows({
    availableBalanceAmount,
    choreographyFinanceRows,
    totalPaidAmount,
  });
}

export function buildOperationalFinanceSummaryFromChoreographyRows(input: {
  availableBalanceAmount: number;
  choreographyFinanceRows: ChoreographyOperationalFinanceRow[];
  totalPaidAmount: number;
}): OperationalFinanceSummary {
  const owedDepositAmount = sumOperationalFinanceAmounts(
    input.choreographyFinanceRows.map((row) => row.owedDepositAmount),
  );
  const grossOwedAmount = sumOperationalFinanceAmounts(
    input.choreographyFinanceRows.map((row) => row.owedAmount),
  );

  return {
    availableBalanceAmount: input.availableBalanceAmount,
    owedAmount: buildOperationalFinanceAmount({
      amount: Math.max(
        0,
        grossOwedAmount.amount - input.availableBalanceAmount,
      ),
      missingPriceCount: grossOwedAmount.missingPriceCount,
    }),
    owedDepositAmount: buildOperationalFinanceAmount({
      amount: owedDepositAmount.amount,
      missingPriceCount: owedDepositAmount.missingPriceCount,
    }),
    totalPaidAmount: input.totalPaidAmount,
  };
}

export function buildChoreographyOperationalFinanceRows(input: {
  academyId: string;
  choreographyRows: FinanceChoreographyRow[];
  financialStates: Map<string, ChoreographyFinancialState>;
  invoiceImputedAmounts: Map<string, number>;
  invoiceRows: FinanceInvoiceRow[];
  priceRows: FinancePriceRow[];
  requiredDepositPercentage: number;
}): ChoreographyOperationalFinanceRow[] {
  const academyInvoiceRows = input.invoiceRows.filter(
    (row) => row.academyId === input.academyId,
  );

  return input.choreographyRows
    .filter((row) => row.academyId === input.academyId)
    .map((choreography) =>
      buildChoreographyOperationalFinanceRow({
        choreography,
        financialState: input.financialStates.get(choreography.id) ?? "impaga",
        invoiceImputedAmounts: input.invoiceImputedAmounts,
        invoiceRows: academyInvoiceRows,
        priceRows: input.priceRows,
        requiredDepositPercentage: input.requiredDepositPercentage,
      }),
    );
}

export function deriveChoreographyFinancialStatesFromRows(input: {
  choreographyIds: string[];
  invoiceImputedAmounts: Map<string, number>;
  invoiceRows: FinanceInvoiceRow[];
}) {
  const states = new Map<string, ChoreographyFinancialState>();

  for (const choreographyId of input.choreographyIds) {
    states.set(choreographyId, "impaga");
  }

  for (const invoice of input.invoiceRows) {
    const imputedAmount = input.invoiceImputedAmounts.get(invoice.id) ?? 0;
    const isPaid = imputedAmount >= invoice.invoiceAmount;

    if (invoice.invoiceType === "saldo" && isPaid) {
      states.set(invoice.choreographyId, "pagada");
      continue;
    }

    if (
      invoice.invoiceType === "sena" &&
      isPaid &&
      states.get(invoice.choreographyId) !== "pagada"
    ) {
      states.set(invoice.choreographyId, "señada");
    }
  }

  return states;
}

export function sumAmountsBy<T>(
  rows: T[],
  getKey: (row: T) => string,
  getAmount: (row: T) => number,
) {
  const amounts = new Map<string, number>();

  for (const row of rows) {
    const key = getKey(row);
    amounts.set(key, (amounts.get(key) ?? 0) + getAmount(row));
  }

  return amounts;
}

export function sumAmounts<T>(rows: T[], getAmount: (row: T) => number) {
  return rows.reduce((total, row) => total + getAmount(row), 0);
}

function buildChoreographyOperationalFinanceRow(input: {
  choreography: FinanceChoreographyRow;
  financialState: ChoreographyFinancialState;
  invoiceImputedAmounts: Map<string, number>;
  invoiceRows: FinanceInvoiceRow[];
  priceRows: FinancePriceRow[];
  requiredDepositPercentage: number;
}): ChoreographyOperationalFinanceRow {
  let owedDepositAmount = 0;
  let owedDepositMissingPriceCount = 0;
  let grossOwedAmount = 0;
  let owedMissingPriceCount = 0;

  const depositInvoice = findInvoice(input.invoiceRows, {
    choreographyId: input.choreography.id,
    invoiceType: "sena",
  });
  const balanceInvoice = findInvoice(input.invoiceRows, {
    choreographyId: input.choreography.id,
    invoiceType: "saldo",
  });
  const basePriceAmount = resolveBasePriceAmount({
    choreography: input.choreography,
    depositInvoice,
    priceRows: input.priceRows,
  });
  const depositAmount = resolveDepositAmount({
    basePriceAmount,
    depositInvoice,
    requiredDepositPercentage: input.requiredDepositPercentage,
  });
  const paidAmount = sumChoreographyImputedAmount({
    choreographyId: input.choreography.id,
    imputedAmounts: input.invoiceImputedAmounts,
    invoiceRows: input.invoiceRows,
  });

  if (input.financialState === "pagada") {
    return {
      basePriceAmount,
      depositAmount,
      depositCompletedOn: depositInvoice?.depositCompletedOn ?? null,
      financialState: input.financialState,
      groupType: input.choreography.groupType,
      id: input.choreography.id,
      name: input.choreography.name,
      owedAmount: completeOperationalFinanceAmount(0),
      owedDepositAmount: completeOperationalFinanceAmount(0),
      paidAmount,
    };
  }

  if (input.financialState === "impaga") {
    if (depositInvoice) {
      owedDepositAmount += getInvoicePendingAmount({
        imputedAmounts: input.invoiceImputedAmounts,
        invoice: depositInvoice,
      });
    } else if (basePriceAmount.status === "incomplete") {
      owedDepositMissingPriceCount++;
    } else {
      owedDepositAmount += calculateDepositAmount({
        amount: basePriceAmount.amount,
        percentage: input.requiredDepositPercentage,
      });
    }
  }

  grossOwedAmount += sumPendingInvoiceAmounts({
    imputedAmounts: input.invoiceImputedAmounts,
    invoices: [depositInvoice, balanceInvoice],
  });

  if (input.financialState === "impaga" && !balanceInvoice) {
    if (depositInvoice) {
      grossOwedAmount += Math.max(
        0,
        depositInvoice.basePriceAmount - depositInvoice.invoiceAmount,
      );
    } else if (basePriceAmount.status === "incomplete") {
      owedMissingPriceCount++;
    } else {
      grossOwedAmount += basePriceAmount.amount;
    }
  }

  if (input.financialState === "señada" && !balanceInvoice) {
    if (depositInvoice) {
      grossOwedAmount += Math.max(
        0,
        depositInvoice.basePriceAmount - depositInvoice.invoiceAmount,
      );
    } else if (basePriceAmount.status === "incomplete") {
      owedMissingPriceCount++;
    } else {
      grossOwedAmount += Math.max(
        0,
        basePriceAmount.amount -
          calculateDepositAmount({
            amount: basePriceAmount.amount,
            percentage: input.requiredDepositPercentage,
          }),
      );
    }
  }

  return {
    basePriceAmount,
    depositAmount,
    depositCompletedOn: depositInvoice?.depositCompletedOn ?? null,
    financialState: input.financialState,
    groupType: input.choreography.groupType,
    id: input.choreography.id,
    name: input.choreography.name,
    owedAmount: buildOperationalFinanceAmount({
      amount: grossOwedAmount,
      missingPriceCount: owedMissingPriceCount,
    }),
    owedDepositAmount: buildOperationalFinanceAmount({
      amount: owedDepositAmount,
      missingPriceCount: owedDepositMissingPriceCount,
    }),
    paidAmount,
  };
}

function buildOperationalFinanceAmount(input: {
  amount: number;
  missingPriceCount: number;
}): OperationalFinanceAmount {
  if (input.missingPriceCount > 0) {
    return incompleteOperationalFinanceAmount(input);
  }

  return completeOperationalFinanceAmount(input.amount);
}

function sumOperationalFinanceAmounts(amounts: OperationalFinanceAmount[]) {
  return amounts.reduce(
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
  );
}

function sumPendingInvoiceAmounts(input: {
  imputedAmounts: Map<string, number>;
  invoices: Array<FinanceInvoiceRow | undefined>;
}) {
  return input.invoices.reduce(
    (total, invoice) =>
      invoice
        ? total +
          getInvoicePendingAmount({
            imputedAmounts: input.imputedAmounts,
            invoice,
          })
        : total,
    0,
  );
}

function getInvoicePendingAmount(input: {
  imputedAmounts: Map<string, number>;
  invoice: FinanceInvoiceRow;
}) {
  return Math.max(
    0,
    input.invoice.invoiceAmount -
      (input.imputedAmounts.get(input.invoice.id) ?? 0),
  );
}

function findInvoice(
  invoiceRows: FinanceInvoiceRow[],
  input: {
    choreographyId: string;
    invoiceType: FinanceInvoiceRow["invoiceType"];
  },
) {
  return invoiceRows.find(
    (invoice) =>
      invoice.choreographyId === input.choreographyId &&
      invoice.invoiceType === input.invoiceType,
  );
}

function resolveBasePriceAmount(input: {
  choreography: FinanceChoreographyRow;
  depositInvoice: FinanceInvoiceRow | undefined;
  priceRows: FinancePriceRow[];
}): OperationalFinanceAmount {
  if (input.depositInvoice) {
    return completeOperationalFinanceAmount(
      input.depositInvoice.basePriceAmount,
    );
  }

  const estimatedBasePriceAmount = resolveEstimatedBasePriceAmount({
    choreography: input.choreography,
    priceRows: input.priceRows,
  });

  if (estimatedBasePriceAmount.status === "missing-price") {
    return incompleteOperationalFinanceAmount({
      amount: 0,
      missingPriceCount: 1,
    });
  }

  return completeOperationalFinanceAmount(estimatedBasePriceAmount.amount);
}

function resolveDepositAmount(input: {
  basePriceAmount: OperationalFinanceAmount;
  depositInvoice: FinanceInvoiceRow | undefined;
  requiredDepositPercentage: number;
}): OperationalFinanceAmount {
  if (input.depositInvoice) {
    return completeOperationalFinanceAmount(input.depositInvoice.invoiceAmount);
  }

  if (input.basePriceAmount.status === "incomplete") {
    return incompleteOperationalFinanceAmount({
      amount: 0,
      missingPriceCount: input.basePriceAmount.missingPriceCount,
    });
  }

  return completeOperationalFinanceAmount(
    calculateDepositAmount({
      amount: input.basePriceAmount.amount,
      percentage: input.requiredDepositPercentage,
    }),
  );
}

function sumChoreographyImputedAmount(input: {
  choreographyId: string;
  imputedAmounts: Map<string, number>;
  invoiceRows: FinanceInvoiceRow[];
}) {
  return input.invoiceRows.reduce(
    (total, invoice) =>
      invoice.choreographyId === input.choreographyId
        ? total + (input.imputedAmounts.get(invoice.id) ?? 0)
        : total,
    0,
  );
}

function resolveEstimatedBasePriceAmount(input: {
  choreography: FinanceChoreographyRow;
  priceRows: FinancePriceRow[];
}): FinanceAmountResolution {
  const scheduleId =
    input.choreography.scheduleCapacityScheduleId ??
    input.choreography.choreographyScheduleId;
  const schedulePrice = scheduleId
    ? selectApplicablePriceFromCandidates(
        input.priceRows.filter(
          (price) =>
            price.groupType === input.choreography.groupType &&
            price.scheduleId === scheduleId,
        ),
        null,
      )
    : null;

  if (schedulePrice) {
    return {
      amount: schedulePrice.amount,
      status: "complete",
    };
  }

  const generalPrice = selectApplicablePriceFromCandidates(
    input.priceRows.filter(
      (price) =>
        price.groupType === input.choreography.groupType &&
        price.scheduleId === null,
    ),
    null,
  );

  if (!generalPrice) {
    return {
      status: "missing-price",
    };
  }

  return {
    amount: generalPrice.amount,
    status: "complete",
  };
}

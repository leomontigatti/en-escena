import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import {
  academyEventChoreographyInvoices,
  academyEventInvoiceImputations,
  academyEventPayments,
  choreographies,
  events,
  prices,
  scheduleCapacities,
} from "@/db/schema";
import {
  completeOperationalFinanceAmount,
  emptyOperationalFinanceSummary,
  incompleteOperationalFinanceAmount,
  type OperationalFinanceAmount,
  type OperationalFinanceSummary,
} from "@/lib/finances/operational-summary";
import { calculateDepositAmount } from "@/lib/finances/choreography-invoices.server";
import { selectApplicablePriceFromCandidates } from "@/lib/prices/repository.server";

type FinanceChoreographyRow = {
  academyId: string;
  choreographyScheduleId: string | null;
  groupType: string;
  id: string;
  scheduleCapacityScheduleId: string | null;
};

type FinanceInvoiceRow = {
  academyId: string;
  basePriceAmount: number;
  choreographyId: string;
  id: string;
  invoiceAmount: number;
  invoiceType: "saldo" | "sena";
};

type FinancePriceRow = typeof prices.$inferSelect;
type FinanceAmountResolution =
  | {
      amount: number;
      status: "complete";
    }
  | {
      status: "missing-price";
    };
type ChoreographyFinancialState = "impaga" | "pagada" | "señada";

export async function readAcademyEventOperationalFinanceSummary(input: {
  academyId: string;
  eventId: string;
}): Promise<OperationalFinanceSummary> {
  const summaries = await readAcademyEventOperationalFinanceSummaries({
    academyIds: [input.academyId],
    eventId: input.eventId,
  });

  return summaries.get(input.academyId) ?? emptyOperationalFinanceSummary();
}

export async function readAcademyEventOperationalFinanceSummaries(input: {
  academyIds: string[];
  eventId: string;
}): Promise<Map<string, OperationalFinanceSummary>> {
  const academyIds = [...new Set(input.academyIds)];
  const summaries = new Map<string, OperationalFinanceSummary>();

  for (const academyId of academyIds) {
    summaries.set(academyId, emptyOperationalFinanceSummary());
  }

  if (academyIds.length === 0) {
    return summaries;
  }

  const [
    event,
    paymentRows,
    imputationRows,
    choreographyRows,
    invoiceRows,
    priceRows,
  ] = await Promise.all([
    db.query.events.findFirst({
      columns: {
        requiredDepositPercentage: true,
      },
      where: eq(events.id, input.eventId),
    }),
    db.query.academyEventPayments.findMany({
      columns: {
        academyId: true,
        amount: true,
      },
      where: and(
        eq(academyEventPayments.eventId, input.eventId),
        inArray(academyEventPayments.academyId, academyIds),
        isNull(academyEventPayments.annulledAt),
      ),
    }),
    db.query.academyEventInvoiceImputations.findMany({
      columns: {
        academyId: true,
        amount: true,
        invoiceId: true,
      },
      where: and(
        eq(academyEventInvoiceImputations.eventId, input.eventId),
        inArray(academyEventInvoiceImputations.academyId, academyIds),
        isNull(academyEventInvoiceImputations.annulledAt),
      ),
    }),
    db
      .select({
        academyId: choreographies.academyId,
        choreographyScheduleId: choreographies.scheduleId,
        groupType: choreographies.groupType,
        id: choreographies.id,
        scheduleCapacityScheduleId: scheduleCapacities.scheduleId,
      })
      .from(choreographies)
      .leftJoin(
        scheduleCapacities,
        eq(choreographies.scheduleCapacityId, scheduleCapacities.id),
      )
      .where(
        and(
          eq(choreographies.eventId, input.eventId),
          inArray(choreographies.academyId, academyIds),
        ),
      ),
    db
      .select({
        academyId: academyEventChoreographyInvoices.academyId,
        basePriceAmount: academyEventChoreographyInvoices.basePriceAmount,
        choreographyId: academyEventChoreographyInvoices.choreographyId,
        id: academyEventChoreographyInvoices.id,
        invoiceAmount: academyEventChoreographyInvoices.depositAmount,
        invoiceType: academyEventChoreographyInvoices.invoiceType,
      })
      .from(academyEventChoreographyInvoices)
      .where(
        and(
          eq(academyEventChoreographyInvoices.eventId, input.eventId),
          inArray(academyEventChoreographyInvoices.academyId, academyIds),
          isNull(academyEventChoreographyInvoices.cancelledAt),
        ),
      ),
    db.query.prices.findMany({
      where: eq(prices.eventId, input.eventId),
    }),
  ]);

  if (!event) {
    throw new Error("Expected event to exist for finance summary.");
  }

  const invoiceImputedAmounts = sumAmountsBy(
    imputationRows,
    (row) => row.invoiceId,
    (row) => row.amount,
  );
  const financialStates = deriveChoreographyFinancialStatesFromRows({
    choreographyIds: choreographyRows.map((row) => row.id),
    invoiceImputedAmounts,
    invoiceRows,
  });
  const paymentAmountsByAcademy = sumAmountsBy(
    paymentRows,
    (row) => row.academyId,
    (row) => row.amount,
  );
  const imputationAmountsByAcademy = sumAmountsBy(
    imputationRows,
    (row) => row.academyId,
    (row) => row.amount,
  );

  for (const academyId of academyIds) {
    summaries.set(
      academyId,
      buildOperationalFinanceSummary({
        academyId,
        choreographyRows,
        financialStates,
        imputationAmountsByAcademy,
        invoiceImputedAmounts,
        invoiceRows,
        paymentAmountsByAcademy,
        priceRows,
        requiredDepositPercentage: event.requiredDepositPercentage,
      }),
    );
  }

  return summaries;
}

function buildOperationalFinanceSummary(input: {
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
  let owedDepositAmount = 0;
  let owedDepositMissingPriceCount = 0;
  let grossOwedAmount = 0;
  let owedMissingPriceCount = 0;
  const academyChoreographies = input.choreographyRows.filter(
    (row) => row.academyId === input.academyId,
  );
  const academyInvoiceRows = input.invoiceRows.filter(
    (row) => row.academyId === input.academyId,
  );

  for (const choreography of academyChoreographies) {
    const financialState =
      input.financialStates.get(choreography.id) ?? "impaga";

    if (financialState === "pagada") {
      continue;
    }

    const depositInvoice = findInvoice(academyInvoiceRows, {
      choreographyId: choreography.id,
      invoiceType: "sena",
    });
    const balanceInvoice = findInvoice(academyInvoiceRows, {
      choreographyId: choreography.id,
      invoiceType: "saldo",
    });

    if (financialState === "impaga") {
      if (depositInvoice) {
        owedDepositAmount += getInvoicePendingAmount({
          imputedAmounts: input.invoiceImputedAmounts,
          invoice: depositInvoice,
        });
      } else {
        const basePriceAmount = resolveEstimatedBasePriceAmount({
          choreography,
          priceRows: input.priceRows,
        });

        if (basePriceAmount.status === "missing-price") {
          owedDepositMissingPriceCount++;
        } else {
          owedDepositAmount += calculateDepositAmount({
            amount: basePriceAmount.amount,
            percentage: input.requiredDepositPercentage,
          });
        }
      }
    }

    grossOwedAmount += sumPendingInvoiceAmounts({
      imputedAmounts: input.invoiceImputedAmounts,
      invoices: [depositInvoice, balanceInvoice],
    });

    if (financialState === "impaga") {
      if (balanceInvoice) {
        continue;
      }

      if (depositInvoice) {
        grossOwedAmount += Math.max(
          0,
          depositInvoice.basePriceAmount - depositInvoice.invoiceAmount,
        );
        continue;
      }

      const basePriceAmount = resolveEstimatedBasePriceAmount({
        choreography,
        priceRows: input.priceRows,
      });

      if (basePriceAmount.status === "missing-price") {
        owedMissingPriceCount++;
      } else {
        grossOwedAmount += basePriceAmount.amount;
      }

      continue;
    }

    if (financialState === "señada" && !balanceInvoice) {
      if (depositInvoice) {
        grossOwedAmount += Math.max(
          0,
          depositInvoice.basePriceAmount - depositInvoice.invoiceAmount,
        );
        continue;
      }

      const basePriceAmount = resolveEstimatedBasePriceAmount({
        choreography,
        priceRows: input.priceRows,
      });

      if (basePriceAmount.status === "missing-price") {
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
  }

  return {
    availableBalanceAmount,
    owedAmount: buildOperationalFinanceAmount({
      amount: Math.max(0, grossOwedAmount - availableBalanceAmount),
      missingPriceCount: owedMissingPriceCount,
    }),
    owedDepositAmount: buildOperationalFinanceAmount({
      amount: owedDepositAmount,
      missingPriceCount: owedDepositMissingPriceCount,
    }),
    totalPaidAmount,
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

function deriveChoreographyFinancialStatesFromRows(input: {
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

function sumAmountsBy<T>(
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

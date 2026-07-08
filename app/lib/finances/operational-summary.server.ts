import { and, asc, eq, inArray, isNull } from "drizzle-orm";

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
  emptyOperationalFinanceSummary,
  type OperationalFinanceSummary,
} from "@/lib/finances/operational-summary";
import {
  buildChoreographyOperationalFinanceRows,
  buildOperationalFinanceSummary,
  buildOperationalFinanceSummaryFromChoreographyRows,
  deriveChoreographyFinancialStatesFromRows,
  sumAmounts,
  sumAmountsBy,
  type ChoreographyOperationalFinanceRow,
} from "@/lib/finances/operational-summary-calculations.server";

export type AcademyEventOperationalFinanceDetail = {
  choreographyFinanceRows: ChoreographyOperationalFinanceRow[];
  summary: OperationalFinanceSummary;
};

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
        name: choreographies.name,
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
        depositCompletedOn: academyEventChoreographyInvoices.depositCompletedOn,
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

export async function readAcademyEventOperationalFinanceDetail(input: {
  academyId: string;
  eventId: string;
}): Promise<AcademyEventOperationalFinanceDetail> {
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
        amount: true,
      },
      where: and(
        eq(academyEventPayments.academyId, input.academyId),
        eq(academyEventPayments.eventId, input.eventId),
        isNull(academyEventPayments.annulledAt),
      ),
    }),
    db.query.academyEventInvoiceImputations.findMany({
      columns: {
        amount: true,
        invoiceId: true,
      },
      where: and(
        eq(academyEventInvoiceImputations.academyId, input.academyId),
        eq(academyEventInvoiceImputations.eventId, input.eventId),
        isNull(academyEventInvoiceImputations.annulledAt),
      ),
    }),
    db
      .select({
        academyId: choreographies.academyId,
        choreographyScheduleId: choreographies.scheduleId,
        groupType: choreographies.groupType,
        id: choreographies.id,
        name: choreographies.name,
        scheduleCapacityScheduleId: scheduleCapacities.scheduleId,
      })
      .from(choreographies)
      .leftJoin(
        scheduleCapacities,
        eq(choreographies.scheduleCapacityId, scheduleCapacities.id),
      )
      .where(
        and(
          eq(choreographies.academyId, input.academyId),
          eq(choreographies.eventId, input.eventId),
        ),
      )
      .orderBy(asc(choreographies.name), asc(choreographies.createdAt)),
    db
      .select({
        academyId: academyEventChoreographyInvoices.academyId,
        basePriceAmount: academyEventChoreographyInvoices.basePriceAmount,
        choreographyId: academyEventChoreographyInvoices.choreographyId,
        depositCompletedOn: academyEventChoreographyInvoices.depositCompletedOn,
        id: academyEventChoreographyInvoices.id,
        invoiceAmount: academyEventChoreographyInvoices.depositAmount,
        invoiceType: academyEventChoreographyInvoices.invoiceType,
      })
      .from(academyEventChoreographyInvoices)
      .where(
        and(
          eq(academyEventChoreographyInvoices.academyId, input.academyId),
          eq(academyEventChoreographyInvoices.eventId, input.eventId),
          isNull(academyEventChoreographyInvoices.cancelledAt),
        ),
      ),
    db.query.prices.findMany({
      where: eq(prices.eventId, input.eventId),
    }),
  ]);

  if (!event) {
    throw new Error("Expected event to exist for finance detail.");
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
  const choreographyFinanceRows = buildChoreographyOperationalFinanceRows({
    academyId: input.academyId,
    choreographyRows,
    financialStates,
    invoiceImputedAmounts,
    invoiceRows,
    priceRows,
    requiredDepositPercentage: event.requiredDepositPercentage,
  });
  const totalPaidAmount = sumAmounts(paymentRows, (row) => row.amount);
  const totalImputedAmount = sumAmounts(imputationRows, (row) => row.amount);
  const availableBalanceAmount = totalPaidAmount - totalImputedAmount;

  return {
    choreographyFinanceRows,
    summary: buildOperationalFinanceSummaryFromChoreographyRows({
      availableBalanceAmount,
      choreographyFinanceRows,
      totalPaidAmount,
    }),
  };
}

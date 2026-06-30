import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  academyEventChoreographyInvoices,
  academyEventInvoiceImputations,
  academyEventPayments,
  choreographies,
} from "@/db/schema";
import { loadAdminEventContext } from "@/lib/admin/event-context.server";
import { requireInternalUser } from "@/lib/auth/internal-access.server";

export type FinanceAccountStatus =
  | "al_dia"
  | "con_deuda"
  | "con_saldo"
  | "mixto";

export type FinanceAccountRow = {
  academyId: string;
  academyName: string;
  availableBalanceAmount: number;
  availablePaymentCount: number;
  lastMovementDate: string | null;
  owedAmount: number;
  pendingInvoiceCount: number;
  status: FinanceAccountStatus;
  totalPaidAmount: number;
};

export async function loadAdminFinanceAccountCurrentList(request: Request) {
  await requireInternalUser(request, ["admin", "auditor"]);
  const eventContext = await loadAdminEventContext(request);
  const selectedEventId = eventContext.selectedEventId;

  if (selectedEventId === null) {
    return {
      rows: [] as FinanceAccountRow[],
      selectedEventId: null,
    };
  }

  const academyIds = await listAcademyIdsForEvent(selectedEventId);

  if (academyIds.length === 0) {
    return {
      rows: [] as FinanceAccountRow[],
      selectedEventId,
    };
  }

  const [academyRows, paymentRows, invoiceRows, imputationRows] =
    await Promise.all([
      db.query.academies.findMany({
        columns: {
          id: true,
          name: true,
        },
        where: inArray(academies.id, academyIds),
        orderBy: [academies.name],
      }),
      db.query.academyEventPayments.findMany({
        columns: {
          academyId: true,
          amount: true,
          id: true,
          paymentDate: true,
        },
        where: and(
          eq(academyEventPayments.eventId, selectedEventId),
          inArray(academyEventPayments.academyId, academyIds),
          isNull(academyEventPayments.annulledAt),
        ),
      }),
      db.query.academyEventChoreographyInvoices.findMany({
        columns: {
          academyId: true,
          depositAmount: true,
          id: true,
          issueDate: true,
        },
        where: and(
          eq(academyEventChoreographyInvoices.eventId, selectedEventId),
          inArray(academyEventChoreographyInvoices.academyId, academyIds),
          isNull(academyEventChoreographyInvoices.cancelledAt),
        ),
      }),
      db.query.academyEventInvoiceImputations.findMany({
        columns: {
          academyId: true,
          amount: true,
          imputationDate: true,
          invoiceId: true,
          paymentId: true,
        },
        where: and(
          eq(academyEventInvoiceImputations.eventId, selectedEventId),
          inArray(academyEventInvoiceImputations.academyId, academyIds),
          isNull(academyEventInvoiceImputations.annulledAt),
        ),
      }),
    ]);

  return {
    rows: academyRows.map((academy) =>
      buildFinanceAccountRow({
        academy,
        imputationRows,
        invoiceRows,
        paymentRows,
      }),
    ),
    selectedEventId,
  };
}

function buildFinanceAccountRow(input: {
  academy: { id: string; name: string };
  imputationRows: Array<{
    academyId: string;
    amount: number;
    imputationDate: string;
    invoiceId: string;
    paymentId: string;
  }>;
  invoiceRows: Array<{
    academyId: string;
    depositAmount: number;
    id: string;
    issueDate: string;
  }>;
  paymentRows: Array<{
    academyId: string;
    amount: number;
    id: string;
    paymentDate: string;
  }>;
}): FinanceAccountRow {
  const payments = input.paymentRows.filter(
    (payment) => payment.academyId === input.academy.id,
  );
  const invoices = input.invoiceRows.filter(
    (invoice) => invoice.academyId === input.academy.id,
  );
  const imputations = input.imputationRows.filter(
    (imputation) => imputation.academyId === input.academy.id,
  );
  const totalPaidAmount = sumBy(payments, (payment) => payment.amount);
  const totalInvoiceAmount = sumBy(
    invoices,
    (invoice) => invoice.depositAmount,
  );
  const totalImputedAmount = sumBy(
    imputations,
    (imputation) => imputation.amount,
  );
  const imputedByInvoice = groupAmountBy(
    imputations,
    (imputation) => imputation.invoiceId,
  );
  const imputedByPayment = groupAmountBy(
    imputations,
    (imputation) => imputation.paymentId,
  );
  const availableBalanceAmount = totalPaidAmount - totalImputedAmount;
  const owedAmount = Math.max(0, totalInvoiceAmount - totalImputedAmount);

  return {
    academyId: input.academy.id,
    academyName: input.academy.name,
    availableBalanceAmount,
    availablePaymentCount: payments.filter(
      (payment) => payment.amount - (imputedByPayment.get(payment.id) ?? 0) > 0,
    ).length,
    lastMovementDate:
      [
        ...payments.map((payment) => payment.paymentDate),
        ...invoices.map((invoice) => invoice.issueDate),
        ...imputations.map((imputation) => imputation.imputationDate),
      ].sort((first, second) => second.localeCompare(first))[0] ?? null,
    owedAmount,
    pendingInvoiceCount: invoices.filter(
      (invoice) =>
        invoice.depositAmount - (imputedByInvoice.get(invoice.id) ?? 0) > 0,
    ).length,
    status: resolveFinanceAccountStatus({
      availableBalanceAmount,
      owedAmount,
    }),
    totalPaidAmount,
  };
}

function resolveFinanceAccountStatus(input: {
  availableBalanceAmount: number;
  owedAmount: number;
}): FinanceAccountStatus {
  if (input.owedAmount > 0 && input.availableBalanceAmount > 0) {
    return "mixto";
  }

  if (input.owedAmount > 0) {
    return "con_deuda";
  }

  if (input.availableBalanceAmount > 0) {
    return "con_saldo";
  }

  return "al_dia";
}

function sumBy<T>(rows: T[], getAmount: (row: T) => number) {
  return rows.reduce((total, row) => total + getAmount(row), 0);
}

function groupAmountBy<T>(rows: T[], getKey: (row: T) => string) {
  const amounts = new Map<string, number>();

  for (const row of rows) {
    const key = getKey(row);
    amounts.set(
      key,
      (amounts.get(key) ?? 0) + (row as { amount: number }).amount,
    );
  }

  return amounts;
}

async function listAcademyIdsForEvent(eventId: string) {
  const [
    academyIdsWithChoreographies,
    academyIdsWithPayments,
    academyIdsWithInvoices,
  ] = await Promise.all([
    db
      .selectDistinct({
        academyId: choreographies.academyId,
      })
      .from(choreographies)
      .where(eq(choreographies.eventId, eventId)),
    db
      .selectDistinct({
        academyId: academyEventPayments.academyId,
      })
      .from(academyEventPayments)
      .where(
        and(
          eq(academyEventPayments.eventId, eventId),
          isNull(academyEventPayments.annulledAt),
        ),
      ),
    db
      .selectDistinct({
        academyId: academyEventChoreographyInvoices.academyId,
      })
      .from(academyEventChoreographyInvoices)
      .where(
        and(
          eq(academyEventChoreographyInvoices.eventId, eventId),
          isNull(academyEventChoreographyInvoices.cancelledAt),
        ),
      ),
  ]);

  return [
    ...new Set([
      ...academyIdsWithChoreographies.map((row) => row.academyId),
      ...academyIdsWithPayments.map((row) => row.academyId),
      ...academyIdsWithInvoices.map((row) => row.academyId),
    ]),
  ];
}

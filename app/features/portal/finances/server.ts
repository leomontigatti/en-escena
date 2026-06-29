import { desc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { academyEventPayments } from "@/db/schema";
import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import {
  readActiveAcademyEventInvoices,
  readAcademyEventPaymentSummary,
} from "@/lib/finances/academy-account-current.server";
import {
  getInvoiceState,
  listActiveImputationTotalsByIds,
} from "@/lib/finances/payment-imputations.server";
import { getPortalActiveEventSummaryContext } from "@/lib/portal/event-context.server";

const emptySummary = {
  totalPaidAmount: 0,
  availableBalanceAmount: 0,
  owedAmount: 0,
};

export async function loadPortalAcademyFinances(request: Request) {
  const [{ academy }, eventContext] = await Promise.all([
    requireAcademyUser(request),
    getPortalActiveEventSummaryContext(request),
  ]);

  if (!eventContext.activeEvent) {
    return {
      activeEvent: null,
      activeBalanceInvoices: [],
      activeDepositInvoices: [],
      payments: [],
      summary: emptySummary,
    };
  }

  const eventId = eventContext.activeEvent.id;
  const [summary, payments, activeInvoices] = await Promise.all([
    readAcademyEventPaymentSummary({
      academyId: academy.id,
      eventId,
    }),
    db.query.academyEventPayments.findMany({
      columns: {
        id: true,
        paymentNumber: true,
        paymentDate: true,
        amount: true,
        paymentMethod: true,
        reference: true,
      },
      where: (table, { and }) =>
        and(
          eq(table.academyId, academy.id),
          eq(table.eventId, eventId),
          isNull(table.annulledAt),
        ),
      orderBy: [
        desc(academyEventPayments.paymentDate),
        desc(academyEventPayments.paymentNumber),
        desc(academyEventPayments.createdAt),
      ],
    }),
    readActiveAcademyEventInvoices({
      academyId: academy.id,
      eventId,
    }),
  ]);

  const imputationTotals = await listActiveImputationTotalsByIds({
    invoiceIds: activeInvoices.map((invoice) => invoice.id),
    paymentIds: payments.map((payment) => payment.id),
  });
  const hydratedPayments = payments.map((payment) => {
    const imputedAmount = imputationTotals.paymentTotals.get(payment.id) ?? 0;

    return {
      ...payment,
      availableAmount: payment.amount - imputedAmount,
      imputedAmount,
    };
  });
  const hydratedInvoices = activeInvoices.map((invoice) => {
    const imputedAmount = imputationTotals.invoiceTotals.get(invoice.id) ?? 0;

    return {
      ...invoice,
      imputedAmount,
      pendingAmount: Math.max(0, invoice.amount - imputedAmount),
      status: getInvoiceState({
        amount: invoice.amount,
        imputedAmount,
      }),
    };
  });

  return {
    activeEvent: eventContext.activeEvent,
    activeBalanceInvoices: hydratedInvoices.filter(
      (invoice) => invoice.invoiceType === "saldo",
    ),
    activeDepositInvoices: hydratedInvoices.filter(
      (invoice) => invoice.invoiceType === "sena",
    ),
    payments: hydratedPayments,
    summary,
  };
}

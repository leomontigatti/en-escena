import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  academyEventChoreographyInvoices,
  academyEventInvoiceImputations,
  academyEventPayments,
  choreographies,
} from "@/db/schema";

export async function readAcademyEventPaymentSummary(input: {
  academyId: string;
  eventId: string;
}) {
  const [[paymentRow], [invoiceRow], [imputationRow]] = await Promise.all([
    db
      .select({
        totalPaidAmount:
          sql<number>`coalesce(sum(${academyEventPayments.amount}), 0)`.mapWith(
            Number,
          ),
      })
      .from(academyEventPayments)
      .where(
        and(
          eq(academyEventPayments.academyId, input.academyId),
          eq(academyEventPayments.eventId, input.eventId),
          isNull(academyEventPayments.annulledAt),
        ),
      ),
    db
      .select({
        totalInvoiceAmount:
          sql<number>`coalesce(sum(${academyEventChoreographyInvoices.depositAmount}), 0)`.mapWith(
            Number,
          ),
      })
      .from(academyEventChoreographyInvoices)
      .where(
        and(
          eq(academyEventChoreographyInvoices.academyId, input.academyId),
          eq(academyEventChoreographyInvoices.eventId, input.eventId),
          isNull(academyEventChoreographyInvoices.cancelledAt),
        ),
      ),
    db
      .select({
        totalImputedAmount:
          sql<number>`coalesce(sum(${academyEventInvoiceImputations.amount}), 0)`.mapWith(
            Number,
          ),
      })
      .from(academyEventInvoiceImputations)
      .where(
        and(
          eq(academyEventInvoiceImputations.academyId, input.academyId),
          eq(academyEventInvoiceImputations.eventId, input.eventId),
          isNull(academyEventInvoiceImputations.annulledAt),
        ),
      ),
  ]);
  const totalPaidAmount = Number(paymentRow?.totalPaidAmount ?? 0);
  const totalInvoiceAmount = Number(invoiceRow?.totalInvoiceAmount ?? 0);
  const totalImputedAmount = Number(imputationRow?.totalImputedAmount ?? 0);

  return {
    totalPaidAmount,
    availableBalanceAmount: totalPaidAmount - totalImputedAmount,
    owedAmount: Math.max(0, totalInvoiceAmount - totalImputedAmount),
  };
}

export async function readActiveAcademyEventInvoices(input: {
  academyId: string;
  eventId: string;
}) {
  return await db
    .select({
      administrativeDiscountAmount:
        academyEventChoreographyInvoices.administrativeDiscountAmount,
      administrativeDiscountPublicLabel:
        academyEventChoreographyInvoices.administrativeDiscountPublicLabel,
      amount: academyEventChoreographyInvoices.depositAmount,
      appliedDepositAmount:
        academyEventChoreographyInvoices.appliedDepositAmount,
      choreographyId: choreographies.id,
      choreographyName: choreographies.name,
      dancerDiscountAmount:
        academyEventChoreographyInvoices.dancerDiscountAmount,
      depositCompletedOn: academyEventChoreographyInvoices.depositCompletedOn,
      finalTotalAmount: academyEventChoreographyInvoices.finalTotalAmount,
      id: academyEventChoreographyInvoices.id,
      invoiceNumber: academyEventChoreographyInvoices.invoiceNumber,
      invoiceType: academyEventChoreographyInvoices.invoiceType,
      issueDate: academyEventChoreographyInvoices.issueDate,
      selectedPaymentDeadline:
        academyEventChoreographyInvoices.selectedPaymentDeadline,
      totalDiscountAmount: academyEventChoreographyInvoices.totalDiscountAmount,
    })
    .from(academyEventChoreographyInvoices)
    .innerJoin(
      choreographies,
      eq(academyEventChoreographyInvoices.choreographyId, choreographies.id),
    )
    .where(
      and(
        eq(academyEventChoreographyInvoices.academyId, input.academyId),
        eq(academyEventChoreographyInvoices.eventId, input.eventId),
        isNull(academyEventChoreographyInvoices.cancelledAt),
      ),
    )
    .orderBy(
      desc(academyEventChoreographyInvoices.issueDate),
      desc(academyEventChoreographyInvoices.invoiceNumber),
    );
}

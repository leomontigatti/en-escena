import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  academyEventChoreographyInvoices,
  academyEventInvoiceImputations,
  academyEventPayments,
  eventFinancialSequences,
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

export async function registerAcademyEventPayment(input: {
  academyId: string;
  amount: number;
  createdByUserId: string;
  eventId: string;
  internalNote: string | null;
  paymentDate: string;
  paymentMethod: (typeof academyEventPayments.$inferInsert)["paymentMethod"];
  reference: string | null;
}) {
  return await db.transaction(async (tx) => {
    await tx
      .insert(eventFinancialSequences)
      .values({
        eventId: input.eventId,
      })
      .onConflictDoNothing();

    const [sequence] = await tx
      .select({
        nextPaymentNumber: eventFinancialSequences.nextPaymentNumber,
      })
      .from(eventFinancialSequences)
      .where(eq(eventFinancialSequences.eventId, input.eventId))
      .for("update");

    if (!sequence) {
      throw new Error("Expected event financial sequence to exist.");
    }

    const paymentNumber = sequence.nextPaymentNumber;

    await tx.insert(academyEventPayments).values({
      academyId: input.academyId,
      amount: input.amount,
      createdByUserId: input.createdByUserId,
      eventId: input.eventId,
      internalNote: input.internalNote,
      paymentDate: input.paymentDate,
      paymentMethod: input.paymentMethod,
      paymentNumber,
      reference: input.reference,
    });

    await tx
      .update(eventFinancialSequences)
      .set({
        nextPaymentNumber: paymentNumber + 1,
        updatedAt: new Date(),
      })
      .where(eq(eventFinancialSequences.eventId, input.eventId));
  });
}

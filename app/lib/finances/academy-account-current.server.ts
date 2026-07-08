import { and, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { academyEventChoreographyInvoices, choreographies } from "@/db/schema";

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

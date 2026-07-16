import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { paymentAllocations, payments as paymentTable } from "@/db/schema";
import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import { emptyOperationalFinanceSummary } from "@/lib/finances/operational-summary";
import { readAcademyEventOperationalFinanceDetail } from "@/lib/finances/operational-summary.server";
import { getPortalActiveEventSummaryContext } from "@/lib/portal/event-context.server";

export async function loadPortalAcademyFinances(request: Request) {
  const [{ academy }, eventContext] = await Promise.all([
    requireAcademyUser(request),
    getPortalActiveEventSummaryContext(request),
  ]);

  if (!eventContext.activeEvent) {
    return {
      activeEvent: null,
      choreographyFinanceRows: [],
      payments: [],
      summary: emptyOperationalFinanceSummary(),
    };
  }

  const eventId = eventContext.activeEvent.id;
  const [financeDetail, payments, allocationRows] = await Promise.all([
    readAcademyEventOperationalFinanceDetail({
      academyId: academy.id,
      eventId,
    }),
    db.query.payments.findMany({
      columns: {
        id: true,
        paymentNumber: true,
        paymentDate: true,
        amount: true,
        paymentMethod: true,
        reference: true,
      },
      where: (table, { and: andCondition }) =>
        andCondition(
          eq(table.academyId, academy.id),
          eq(table.eventId, eventId),
        ),
      orderBy: [
        desc(paymentTable.paymentDate),
        desc(paymentTable.paymentNumber),
        desc(paymentTable.createdAt),
      ],
    }),
    db
      .select({
        paymentId: paymentAllocations.paymentId,
        amount: paymentAllocations.amount,
      })
      .from(paymentAllocations)
      .where(
        and(
          eq(paymentAllocations.academyId, academy.id),
          eq(paymentAllocations.eventId, eventId),
        ),
      ),
  ]);

  const allocatedByPayment = new Map<string, number>();
  for (const allocation of allocationRows) {
    allocatedByPayment.set(
      allocation.paymentId,
      (allocatedByPayment.get(allocation.paymentId) ?? 0) + allocation.amount,
    );
  }

  const hydratedPayments = payments.map((payment) => {
    const allocatedAmount = allocatedByPayment.get(payment.id) ?? 0;

    return {
      ...payment,
      allocatedAmount,
      availableAmount: payment.amount - allocatedAmount,
    };
  });

  return {
    activeEvent: eventContext.activeEvent,
    choreographyFinanceRows: financeDetail.choreographyFinanceRows,
    payments: hydratedPayments,
    summary: financeDetail.summary,
  };
}

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { payments as paymentTable } from "@/db/schema";
import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import { getPortalActiveEventSummaryContext } from "@/lib/portal/event-context.server";

export async function loadPortalAcademyPayments(request: Request) {
  const [{ academy }, eventContext] = await Promise.all([
    requireAcademyUser(request),
    getPortalActiveEventSummaryContext(request),
  ]);

  if (!eventContext.activeEvent) {
    return {
      activeEvent: null,
      payments: [],
    };
  }

  return {
    activeEvent: eventContext.activeEvent,
    payments: await readAcademyEventPayments({
      academyId: academy.id,
      eventId: eventContext.activeEvent.id,
    }),
  };
}

/**
 * An academy's payments within an event. It never exposes the payment's internal
 * note: that is for administrative use and this read feeds the portal.
 */
async function readAcademyEventPayments(input: {
  academyId: string;
  eventId: string;
}) {
  return await db
    .select({
      id: paymentTable.id,
      amount: paymentTable.amount,
      paymentDate: paymentTable.paymentDate,
      paymentMethod: paymentTable.paymentMethod,
      paymentNumber: paymentTable.paymentNumber,
      reference: paymentTable.reference,
    })
    .from(paymentTable)
    .where(
      and(
        eq(paymentTable.academyId, input.academyId),
        eq(paymentTable.eventId, input.eventId),
      ),
    )
    .orderBy(
      desc(paymentTable.paymentDate),
      desc(paymentTable.paymentNumber),
      desc(paymentTable.createdAt),
    );
}

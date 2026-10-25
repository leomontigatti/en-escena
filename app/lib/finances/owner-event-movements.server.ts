import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { payments } from "@/db/schema";

/**
 * An owner's payments within an event, newest first: an academy's for the
 * portal, an individual's for its own area (ADR-0019). It never exposes the
 * payment's internal note: that is for administrative use and this read feeds
 * the owner's own screens.
 */
export async function readOwnerEventMovements(input: {
  academyId: string;
  eventId: string;
}) {
  return await db
    .select({
      id: payments.id,
      amount: payments.amount,
      paymentDate: payments.paymentDate,
      paymentMethod: payments.paymentMethod,
      paymentNumber: payments.paymentNumber,
      reference: payments.reference,
    })
    .from(payments)
    .where(
      and(
        eq(payments.academyId, input.academyId),
        eq(payments.eventId, input.eventId),
      ),
    )
    .orderBy(
      desc(payments.paymentDate),
      desc(payments.paymentNumber),
      desc(payments.createdAt),
    );
}

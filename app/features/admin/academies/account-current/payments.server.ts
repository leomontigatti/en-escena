import { eq } from "drizzle-orm";

import { db } from "@/db";
import { academyEventPayments, eventFinancialSequences } from "@/db/schema";

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

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { payments, eventFinancialSequences } from "@/db/schema";

export async function registerAcademyEventPayment(input: {
  academyId: string;
  amount: number;
  eventId: string;
  internalNote: string | null;
  paymentDate: string;
  paymentMethod: (typeof payments.$inferInsert)["paymentMethod"];
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

    const [inserted] = await tx
      .insert(payments)
      .values({
        academyId: input.academyId,
        amount: input.amount,
        eventId: input.eventId,
        internalNote: input.internalNote,
        paymentDate: input.paymentDate,
        paymentMethod: input.paymentMethod,
        paymentNumber,
        reference: input.reference,
      })
      .returning({ id: payments.id });

    await tx
      .update(eventFinancialSequences)
      .set({
        nextPaymentNumber: paymentNumber + 1,
        updatedAt: new Date(),
      })
      .where(eq(eventFinancialSequences.eventId, input.eventId));

    return { paymentId: inserted.id };
  });
}

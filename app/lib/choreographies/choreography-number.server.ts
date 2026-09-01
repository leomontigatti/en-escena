import { eq } from "drizzle-orm";

import { db } from "@/db";
import { eventSequences } from "@/db/schema";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Hands out the event's next choreography number and leaves the counter ready
 * for the following one. It belongs inside the transaction that inserts the
 * choreography: the `FOR UPDATE` serializes two simultaneous creations in the
 * same event, and if the insert fails the number rolls back with it.
 *
 * The `insert ... on conflict do nothing` creates the counter row the first
 * time an event needs it, no matter whether a payment or a choreography got
 * there first.
 */
export async function allocateChoreographyNumber(input: {
  tx: Transaction;
  eventId: string;
}) {
  await input.tx
    .insert(eventSequences)
    .values({ eventId: input.eventId })
    .onConflictDoNothing();

  const [sequence] = await input.tx
    .select({
      nextChoreographyNumber: eventSequences.nextChoreographyNumber,
    })
    .from(eventSequences)
    .where(eq(eventSequences.eventId, input.eventId))
    .for("update");

  if (!sequence) {
    throw new Error("Expected event sequence to exist.");
  }

  const choreographyNumber = sequence.nextChoreographyNumber;

  await input.tx
    .update(eventSequences)
    .set({
      nextChoreographyNumber: choreographyNumber + 1,
      updatedAt: new Date(),
    })
    .where(eq(eventSequences.eventId, input.eventId));

  return choreographyNumber;
}

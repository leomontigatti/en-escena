import { eq } from "drizzle-orm";

import { db } from "@/db";
import { eventSequences } from "@/db/schema";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Entrega el próximo número de coreografía del evento y deja el contador
 * listo para el siguiente. Va dentro de la transacción que inserta la
 * coreografía: el `FOR UPDATE` serializa dos altas simultáneas del mismo
 * evento, y si la inserción falla, el número vuelve atrás con ella.
 *
 * El `insert ... on conflict do nothing` crea la fila del contador la primera
 * vez que un evento la necesita, sin importar si llegó antes por un pago o por
 * una coreografía.
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

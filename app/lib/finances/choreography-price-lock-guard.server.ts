import { eq } from "drizzle-orm";

import { db } from "@/db";
import { choreographyDancers, paymentAllocations } from "@/db/schema";

import type { Transaction } from "./choreography-cobro-support.server";

/**
 * ¿Alguna inscripción de la coreografía tiene el precio trabado por dinero?
 *
 * La prueba es tener asignaciones de pago encima, que es exactamente lo que
 * traba el precio: el guard de la base rechaza mover `selected_price_id` de una
 * inscripción con plata asignada. El cupo de cronograma es una clave de precio, y
 * moverlo con el precio trabado dejaría la inscripción cobrada contra un
 * cronograma que la coreografía ya no tiene.
 */
export async function hasPriceLockedInscription(
  choreographyId: string,
  executor: Transaction | typeof db = db,
) {
  const [inscription] = await executor
    .select({ id: choreographyDancers.id })
    .from(choreographyDancers)
    .innerJoin(
      paymentAllocations,
      eq(paymentAllocations.inscriptionId, choreographyDancers.id),
    )
    .where(eq(choreographyDancers.choreographyId, choreographyId))
    .limit(1);

  return inscription !== undefined;
}

import { and, eq, isNotNull } from "drizzle-orm";

import { db } from "@/db";
import { choreographyDancers } from "@/db/schema";

import type { Transaction } from "./choreography-cobro-support.server";

/**
 * ¿Alguna inscripción de la coreografía tiene el snapshot de seña puesto?
 *
 * La prueba es la presencia de `depositReferenceDate`, no la escalera
 * `impaga`/`señada`/`pagada`: el snapshot y la asignación de pago se crean y se
 * borran juntos, así que su presencia es el test honesto de "esta coreografía
 * ya tiene plata imputada contra su precio congelado". El cupo de cronograma es
 * una clave de precio, y moverlo con el precio congelado dejaría el snapshot
 * apuntando a un cronograma que la coreografía ya no tiene.
 */
export async function hasFrozenDepositSnapshot(
  choreographyId: string,
  executor: Transaction | typeof db = db,
) {
  const [inscription] = await executor
    .select({ id: choreographyDancers.id })
    .from(choreographyDancers)
    .where(
      and(
        eq(choreographyDancers.choreographyId, choreographyId),
        isNotNull(choreographyDancers.depositReferenceDate),
      ),
    )
    .limit(1);

  return inscription !== undefined;
}

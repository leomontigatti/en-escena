import { and, eq, inArray, isNotNull } from "drizzle-orm";

import { db } from "@/db";
import {
  choreographyDancers,
  comprobanteInscriptions,
  paymentAllocations,
} from "@/db/schema";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = Transaction | typeof db;

/**
 * Evidencia de una inscripción: dinero asignado o una línea de comprobante. Es
 * la justificación para conservar la fila, así que también es lo que la baja
 * del roster consulta para elegir entre borrar y retirar, y lo que el loader
 * del detalle admin usa para contarle la consecuencia al admin antes de
 * confirmar.
 */
export async function findInscriptionsWithEvidence(
  inscriptionIds: string[],
  executor: Executor = db,
): Promise<Set<string>> {
  if (inscriptionIds.length === 0) {
    return new Set();
  }

  const [allocated, invoiced] = await Promise.all([
    executor
      .selectDistinct({ inscriptionId: paymentAllocations.inscriptionId })
      .from(paymentAllocations)
      .where(inArray(paymentAllocations.inscriptionId, inscriptionIds)),
    executor
      .selectDistinct({ inscriptionId: comprobanteInscriptions.inscriptionId })
      .from(comprobanteInscriptions)
      .where(
        and(
          isNotNull(comprobanteInscriptions.inscriptionId),
          inArray(comprobanteInscriptions.inscriptionId, inscriptionIds),
        ),
      ),
  ]);

  return new Set([
    ...allocated.map((row) => row.inscriptionId),
    ...invoiced.flatMap((row) =>
      row.inscriptionId ? [row.inscriptionId] : [],
    ),
  ]);
}

/**
 * Quita inscripciones del roster eligiendo una sola vez, acá, entre borrado
 * físico y retiro: sin evidencia la fila se va —no documenta nada y dejarla
 * obligaría a relajar `choreography_dancer_unique`—, y con evidencia se marca
 * `withdrawnAt` y se queda con el dinero encima.
 *
 * La elección no se revisa nunca más. Desasignar después no toca esta fila: un
 * borrado diferido reintroduciría el cascade que se acaba de evitar y volvería
 * escritura a la desasignación.
 */
export async function removeInscriptionsFromRoster(
  executor: Executor,
  inscriptionIds: string[],
): Promise<void> {
  if (inscriptionIds.length === 0) {
    return;
  }

  const evidence = await findInscriptionsWithEvidence(inscriptionIds, executor);
  const withdrawnIds = inscriptionIds.filter((id) => evidence.has(id));
  const deletedIds = inscriptionIds.filter((id) => !evidence.has(id));

  if (deletedIds.length > 0) {
    await executor
      .delete(choreographyDancers)
      .where(inArray(choreographyDancers.id, deletedIds));
  }

  if (withdrawnIds.length > 0) {
    await executor
      .update(choreographyDancers)
      .set({ withdrawnAt: new Date() })
      .where(inArray(choreographyDancers.id, withdrawnIds));
  }
}

/**
 * Volver a agregar al mismo bailarín revive su fila retirada en lugar de
 * insertar otra: el `id` de la inscripción sobrevive, y con él el dinero y la
 * línea de comprobante que la retuvieron. Una baja corregida antes de que salga
 * el documento fiscal no deja rastro.
 */
export async function reviveWithdrawnInscriptions(
  executor: Executor,
  inscriptions: Array<{ ageAtEventStart: number; id: string }>,
): Promise<void> {
  for (const inscription of inscriptions) {
    await executor
      .update(choreographyDancers)
      .set({
        ageAtEventStart: inscription.ageAtEventStart,
        withdrawnAt: null,
      })
      .where(eq(choreographyDancers.id, inscription.id));
  }
}

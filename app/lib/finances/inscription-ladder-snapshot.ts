/**
 * Lo que queda de la escalera: la **etapa de snapshot** de una inscripción, por
 * presencia de las fechas de referencia.
 *
 * No es el estado financiero — ese se deriva del dinero en
 * `inscription-financial-status.ts` y es lo que la aplicación lee. Esto sólo
 * sirve al camino de escritura de `Pagar seña` / `Pagar saldo`, que todavía fija
 * y limpia los snapshots. Muere con las diez columnas `frozen_*`.
 */

export type InscriptionLadderStage = "impaga" | "señada" | "pagada";

export type InscriptionLadderSnapshot = {
  balanceReferenceDate: string | null;
  depositReferenceDate: string | null;
};

export function deriveInscriptionLadderStage(
  snapshot: InscriptionLadderSnapshot,
): InscriptionLadderStage {
  if (snapshot.balanceReferenceDate !== null) {
    return "pagada";
  }

  if (snapshot.depositReferenceDate !== null) {
    return "señada";
  }

  return "impaga";
}

/** THROWAWAY PROTOTYPE — ticket #585 of map #547. */
import type { DancerDiscountProvenance } from "./fixtures";

export const prototypeVariantKeys = ["A", "B", "C"] as const;
export type PrototypeVariantKey = (typeof prototypeVariantKeys)[number];

export const prototypeVariantNames: Record<PrototypeVariantKey, string> = {
  A: "Sección, sólo composición",
  B: "Sección, composición y movimiento",
  C: "Sin sección: el detalle en la fila",
};

export const prototypeAudienceKeys = ["admin", "portal"] as const;
export type PrototypeAudienceKey = (typeof prototypeAudienceKeys)[number];

export const prototypeAudienceNames: Record<PrototypeAudienceKey, string> = {
  admin: "Panel de administración",
  portal: "Portal de academias",
};

/**
 * The one sentence that has to answer «¿por qué este número?». Kept here rather
 * than in a component so the three variants cannot drift into three wordings.
 */
export function readProvenanceSummary(provenance: DancerDiscountProvenance) {
  const {
    qualifyingCount,
    percentage,
    reason,
    excludedByTieBreak,
    excludedChoreographyName,
  } = provenance;
  const inscriptions =
    qualifyingCount === 1
      ? "1 inscripción"
      : `${qualifyingCount} inscripciones`;

  if (reason === "belowTier") {
    return `${inscriptions} en el evento: hacen falta 3 para el 10 %.`;
  }

  // The tie is the common case: the inscriptions of one choreography share a
  // price row, so «la más cara» describes two identical numbers and the id
  // decides. Saying it is the difference between a rule and an arbitrary result.
  const tie = excludedByTieBreak
    ? " Empata en precio con otra inscripción del bailarín; desempata el identificador."
    : "";

  if (reason === "excludedAsMostExpensive") {
    return `${inscriptions} en el evento, ${percentage} %. Esta queda sin descuento por ser la más cara del bailarín.${tie}`;
  }

  return `${inscriptions} en el evento: ${percentage} % sobre el precio base. Queda sin descuento «${excludedChoreographyName}», la más cara.${tie}`;
}

export function formatPercentage(percentage: number) {
  return `${percentage} %`;
}

/**
 * What the inscription money gestures say when they refuse, worded once for both
 * kinds of inscription. A kind keeps its own copy only for the parent it names:
 * a choreography and a seminar really are different things to not find.
 */
export const inscriptionMoneyRefusals = {
  inscriptionNotFound: "No encontramos esa inscripción.",
  noExcess: "Esta inscripción no tiene excedente para liberar.",
  notWithdrawn: "Esta inscripción no está retirada.",
  pickPrice: "Elegí un precio para la inscripción.",
  priceFixed:
    "El precio queda fijo desde que la inscripción cubre su seña. Para cambiarlo hay que quitarle dinero hasta dejarla por debajo de la seña.",
  unknownPriceRow: "No encontramos esa fila de precio.",
  /**
   * `Quitar dinero` with an amount, or `Liberar` just the excess, on a withdrawn
   * row: an amount in between the two outcomes is what the clause forbids.
   */
  partialRetainedRelease:
    "De una inscripción retirada se libera toda la seña retenida o nada.",
} as const;

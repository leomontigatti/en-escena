import type { RosterChoreography } from "@/lib/roster/inscriptions";

/**
 * One row of the inscriptions tab of a dancer's ficha. Administration and the
 * academy portal read the same shape; only the choreography link differs.
 *
 * The figures are the finance read model's for the same inscription — the
 * effective price, the live `Descuento por bailarín` and the `Total` they
 * produce, which on a withdrawn row is what remains allocated to it — so this
 * tab cannot disagree with the finance surfaces.
 */
export type DancerInscription = RosterChoreography & {
  basePriceAmount: number | null;
  dancerDiscountAmount: number;
  totalAmount: number | null;
};

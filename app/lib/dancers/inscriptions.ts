/**
 * One row of the inscriptions tab of a dancer's ficha. Administration and the
 * academy portal read the same shape; only the choreography link differs.
 */
export type DancerInscription = {
  id: string;
  choreographyName: string;
  choreographyNumber: number;
  categoryName: string | null;
  groupType: "solo" | "duo" | "trio" | "grupal";
  basePriceAmount: number | null;
  discountAmount: number;
  estimatedSubtotalAmount: number | null;
};

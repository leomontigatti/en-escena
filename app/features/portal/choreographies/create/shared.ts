import type { InscriptionPriceRow } from "@/lib/finances/inscription-price";

export type ActiveDancer = {
  id: string;
  firstName: string;
  lastName: string;
};

export type ActiveProfessor = {
  id: string;
  firstName: string;
  lastName: string;
};

/**
 * What the summary needs to quote the price per dancer before the academy
 * saves: the event's price rows, the business date they are chosen on and the
 * event's `Seña (%)`, which splits the price. The choice itself is
 * `selectApplicableInscriptionPrice`, the rule every money surface shares.
 */
export type PortalRegistrationPricing = {
  businessDate: string;
  priceRows: InscriptionPriceRow[];
  requiredDepositPercentage: number;
};

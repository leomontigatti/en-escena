/**
 * THROWAWAY PROTOTYPE — ticket #585 of map #547.
 *
 * The dancer discount, derived. Split out of `fixtures.ts` because it is a rule
 * with its own vocabulary — a qualifying set, a tier, an exclusion — and not
 * part of the fixture's shape.
 *
 * The set counts **registered** active inscriptions of the dancer in the same
 * academy and event (#552), so a tier is legible from the moment of
 * registration, before any money exists, and it moves whenever a sibling in
 * another choreography registers or is given de baja.
 */
import type { PrototypeInscription, PrototypeState } from "./fixtures";

/**
 * `docs/domain/finances.md:385-390`: under 3 qualifying inscriptions there is no
 * tier at all. The set counts **registered** active inscriptions of the dancer
 * in the same academy and event (#552) — not `señada` or `pagada` ones — so a
 * tier is legible from the moment of registration, before any money exists.
 */
export function readDiscountPercentage(qualifyingCount: number) {
  if (qualifyingCount >= 4) return 15;
  if (qualifyingCount === 3) return 10;
  return 0;
}

export type QualifyingInscription = {
  inscriptionId: string;
  choreographyId: string;
  choreographyName: string;
  priceAmount: number;
  isThisInscription: boolean;
  isExcluded: boolean;
  discountAmount: number;
};

export type DancerDiscountProvenance = {
  dancerId: string;
  dancerName: string;
  qualifying: QualifyingInscription[];
  qualifyingCount: number;
  percentage: number;
  /** Dropped from the set by a soft withdrawal, kept so the drop is explicable. */
  withdrawn: QualifyingInscription[];
  /** The discount on the inscription this reading is about. */
  discountAmount: number;
  reason: "belowTier" | "excludedAsMostExpensive" | "granted";
  excludedChoreographyName: string | null;
};

/**
 * The whole derivation for one dancer, over the **academy and event** — never
 * over one choreography, which is exactly the scoping no screen has shown.
 */
export function readDancerDiscount(
  state: PrototypeState,
  dancerId: string,
  thisInscriptionId: string,
): DancerDiscountProvenance {
  const dancer = state.dancers.find((row) => row.id === dancerId);
  const own = state.inscriptions.filter((row) => row.dancerId === dancerId);

  const toQualifying = (
    inscription: PrototypeInscription,
  ): QualifyingInscription => {
    const choreography = state.choreographies.find(
      (row) => row.id === inscription.choreographyId,
    );
    const price = state.prices.find(
      (row) => row.id === inscription.selectedPriceId,
    );

    return {
      inscriptionId: inscription.id,
      choreographyId: inscription.choreographyId,
      choreographyName: choreography?.name ?? "",
      priceAmount: price?.amount ?? 0,
      isThisInscription: inscription.id === thisInscriptionId,
      isExcluded: false,
      discountAmount: 0,
    };
  };

  const qualifying = own
    .filter((row) => row.withdrawnAt === null)
    .map(toQualifying);
  const withdrawn = own
    .filter((row) => row.withdrawnAt !== null)
    .map(toQualifying);

  const percentage = readDiscountPercentage(qualifying.length);

  // One inscription keeps its full price: the most expensive. It is the part of
  // the rule nothing on screen has ever stated.
  //
  // Ties are the common case — a choreography's inscriptions share a price row —
  // and the id settles them. That is an implementation detail and **is never
  // shown**: it explains nothing an academy could act on, and naming it only
  // invites an argument about a number that would be identical either way.
  const excluded =
    percentage === 0
      ? undefined
      : [...qualifying].sort(
          (left, right) =>
            right.priceAmount - left.priceAmount ||
            left.inscriptionId.localeCompare(right.inscriptionId),
        )[0];

  for (const row of qualifying) {
    row.isExcluded = row.inscriptionId === excluded?.inscriptionId;
    row.discountAmount = row.isExcluded
      ? 0
      : Math.round((row.priceAmount * percentage) / 100);
  }

  const thisOne = qualifying.find((row) => row.isThisInscription);

  return {
    dancerId,
    dancerName: dancer?.name ?? "",
    qualifying,
    qualifyingCount: qualifying.length,
    percentage,
    withdrawn,
    discountAmount: thisOne?.discountAmount ?? 0,
    reason:
      percentage === 0
        ? "belowTier"
        : thisOne?.isExcluded === true
          ? "excludedAsMostExpensive"
          : "granted",
    excludedChoreographyName: excluded?.choreographyName ?? null,
  };
}

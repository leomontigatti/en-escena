// The state of an individual's link to the roster rows that carry its document
// (ADR-0019). It is derived from the `individual` row, never stored, so no
// write can leave it stale. Client-safe: `Perfil` reads these labels, and
// administration names the same states in words of its own
// (`app/features/admin/individuals/link-review-badge.tsx`).

export type IndividualLinkState = "linked" | "pending" | "unlinked";

const individualLinkStateLabels = {
  linked: "Vinculado",
  pending: "Pendiente",
  unlinked: "Sin vincular",
} as const satisfies Record<IndividualLinkState, string>;

/** In the order an individual goes through them, for a facet. */
export const individualLinkStates = [
  "unlinked",
  "pending",
  "linked",
] as const satisfies readonly IndividualLinkState[];

export function isIndividualLinkState(
  value: string,
): value is IndividualLinkState {
  return (individualLinkStates as readonly string[]).includes(value);
}

/**
 * `Sin vincular` until the individual uploads a photo of its document, then
 * `Pendiente` until administration confirms the link, and `Vinculado` while
 * the confirmation was given for the document the individual holds now. The
 * photo is read first: without one the individual is `Sin vincular` even when
 * a confirmation for its current number exists. Its SQL twin is
 * `individualLinkStateSql` in `link.server.ts`.
 */
export function deriveIndividualLinkState(individual: {
  documentNumber: string;
  documentPhotoStorageKey: string | null;
  linkConfirmedDocumentNumber: string | null;
}): IndividualLinkState {
  if (!individual.documentPhotoStorageKey) {
    return "unlinked";
  }

  return individual.linkConfirmedDocumentNumber === individual.documentNumber
    ? "linked"
    : "pending";
}

export function formatIndividualLinkStateLabel(state: IndividualLinkState) {
  return individualLinkStateLabels[state];
}

export function getIndividualLinkStateBadgeVariant(state: IndividualLinkState) {
  switch (state) {
    case "linked":
      return "success";
    case "pending":
      return "info";
    case "unlinked":
      return "warning";
  }
}

// The state of an individual's link to the roster rows that carry its document
// (ADR-0019). It is derived from the `individual` row, never stored, so no
// write can leave it stale. Client-safe: `Mis datos` and, later, the
// `Particulares` admin section read the same labels.

export type IndividualLinkState = "pending" | "unlinked";

const individualLinkStateLabels = {
  pending: "Pendiente",
  unlinked: "Sin vincular",
} as const satisfies Record<IndividualLinkState, string>;

/**
 * `Sin vincular` until the individual uploads a photo of its document, then
 * `Pendiente` until administration confirms the link.
 */
export function deriveIndividualLinkState(individual: {
  documentPhotoStorageKey: string | null;
}): IndividualLinkState {
  return individual.documentPhotoStorageKey ? "pending" : "unlinked";
}

export function formatIndividualLinkStateLabel(state: IndividualLinkState) {
  return individualLinkStateLabels[state];
}

export function getIndividualLinkStateBadgeVariant(state: IndividualLinkState) {
  switch (state) {
    case "pending":
      return "info";
    case "unlinked":
      return "warning";
  }
}

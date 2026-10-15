import { Badge } from "@/components/ui/badge";
import {
  getIndividualLinkStateBadgeVariant,
  individualLinkStates,
  type IndividualLinkState,
} from "@/lib/individuals/link-state";

/**
 * An individual's link state in administration's words, which say what is left
 * to do: `Incompleto` without a document photo, `Sin verificar` until the link
 * is confirmed for the current number. The individual reads its own words in
 * `Perfil`; the state underneath is the same.
 */
const individualLinkReviewLabels = {
  linked: "Vinculado",
  pending: "Sin verificar",
  unlinked: "Incompleto",
} as const satisfies Record<IndividualLinkState, string>;

export function formatIndividualLinkReviewLabel(state: IndividualLinkState) {
  return individualLinkReviewLabels[state];
}

/** The list's `Vínculo` facet, in the order an individual goes through it. */
export const individualLinkReviewOptions = individualLinkStates.map(
  (state) => ({
    label: individualLinkReviewLabels[state],
    value: state,
  }),
);

/** An individual's link state on the `Particulares` list and detail. */
export function IndividualLinkReviewBadge({
  state,
}: {
  state: IndividualLinkState;
}) {
  return (
    <Badge variant={getIndividualLinkStateBadgeVariant(state)}>
      {individualLinkReviewLabels[state]}
    </Badge>
  );
}

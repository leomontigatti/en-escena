import { Badge } from "@/components/ui/badge";
import {
  formatIndividualLinkStateLabel,
  getIndividualLinkStateBadgeVariant,
  type IndividualLinkState,
} from "@/lib/individuals/link-state";

/** An individual's link state as a badge, the same wherever it is shown. */
export function IndividualLinkStateBadge({
  state,
}: {
  state: IndividualLinkState;
}) {
  return (
    <Badge variant={getIndividualLinkStateBadgeVariant(state)}>
      {formatIndividualLinkStateLabel(state)}
    </Badge>
  );
}

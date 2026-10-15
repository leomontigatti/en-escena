import { Badge } from "@/components/ui/badge";
import {
  rosterPersonNoun,
  type InscriptionPersonKind,
} from "@/lib/roster/roster-person-kind.shared";

/**
 * `Particular` beside the name of an individual's seminar inscription
 * (ADR-0019), in administration's seminar finance lists: the name alone reads
 * like an academy's dancer. A roster person gets no badge, as on every other
 * finance list.
 */
export function IndividualPersonBadge({
  personKind,
}: {
  personKind: InscriptionPersonKind;
}) {
  return personKind === "individual" ? (
    <Badge variant="secondary">
      {rosterPersonNoun("individual", "singularCapitalized")}
    </Badge>
  ) : null;
}

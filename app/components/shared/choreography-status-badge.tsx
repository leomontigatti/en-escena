import { Badge } from "@/components/ui/badge";
import {
  resolveChoreographyStatusBadge,
  type ChoreographyOperationalStatus,
} from "@/lib/choreographies/operational-status";

/**
 * A choreography's `Estado`, the same on both lists and both operational
 * details. `Retirada` **replaces** the readiness badge rather than sitting next
 * to it: a choreography that is not taking part is not half-loaded, it is out,
 * and what it still lacks is no longer anyone's task.
 */
export function ChoreographyStatusBadge({
  choreography,
}: {
  choreography: {
    isWithdrawn: boolean;
    operationalStatus: ChoreographyOperationalStatus;
  };
}) {
  const badge = resolveChoreographyStatusBadge(choreography);

  return <Badge variant={badge.variant}>{badge.label}</Badge>;
}

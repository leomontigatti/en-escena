/** THROWAWAY PROTOTYPE — pieces shared across the prototype's views (#550). */
import { Badge } from "@/components/ui/badge";

import { choreographyAnomalyLabels, type ChoreographyAnomaly } from "./rollup";

/**
 * #551's anomalies as badges. They are a derived, self-clearing array, so there
 * is nothing to acknowledge or dismiss: they disappear once the condition stops
 * holding.
 */
export function ChoreographyAnomalyBadges({
  anomalies,
}: {
  anomalies: ChoreographyAnomaly[];
}) {
  if (anomalies.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {anomalies.map((anomaly) => (
        // `destructive`, matching the detail: an anomaly is not the same kind of
        // fact as a pending deposit, which already owns `warning`.
        <Badge key={anomaly} variant="destructive">
          {choreographyAnomalyLabels[anomaly]}
        </Badge>
      ))}
    </div>
  );
}

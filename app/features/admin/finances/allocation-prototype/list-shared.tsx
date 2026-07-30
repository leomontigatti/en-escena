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
        <Badge key={anomaly} variant="warning" className="text-[0.6875rem]">
          {choreographyAnomalyLabels[anomaly]}
        </Badge>
      ))}
    </div>
  );
}

/** PROTOTIPO DESCARTABLE — piezas compartidas por las variantes de la lista (#550). */
import { Badge } from "@/components/ui/badge";

import { choreographyAnomalyLabels, type ChoreographyAnomaly } from "./rollup";

/**
 * Las anomalías de #551 como badges. Son un array derivado y autolimpiante, así
 * que no hay nada que reconocer ni descartar: desaparecen cuando el estado deja
 * de cumplirse.
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

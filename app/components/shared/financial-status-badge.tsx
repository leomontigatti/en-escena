import { Badge } from "@/components/ui/badge";
import { formatInscriptionStatusBadge } from "@/lib/finances/choreography-financial-status";
import type { InscriptionStatusBadge } from "@/lib/finances/inscription-financial-status";

/**
 * A financial `Estado` once `resolveInscriptionStatusBadge` has picked its axis,
 * the same on a list row and on the detail it opens. Which axes a surface asks
 * for stays with the surface: the portal leaves the anomalies out.
 */
export function FinancialStatusBadge({
  status,
}: {
  status: InscriptionStatusBadge;
}) {
  const badge = formatInscriptionStatusBadge(status);

  return <Badge variant={badge.variant}>{badge.label}</Badge>;
}

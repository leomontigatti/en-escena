import { Badge } from "@/components/ui/badge";
import type { ComprobanteStatus } from "@/lib/comprobantes/comprobante-status.server";
import { formatComprobanteStatusLabel } from "@/lib/comprobantes/format";

const statusBadgeVariants: Record<
  ComprobanteStatus,
  "success" | "warning" | "destructive"
> = {
  valid: "success",
  adjusted: "warning",
  annulled: "destructive",
};

/** Where an invoice stands against its notes, as administration and the
 * individual read it. A note carries no status, so it gets no badge. */
export function ComprobanteStatusBadge({
  status,
}: {
  status: ComprobanteStatus | null;
}) {
  if (status === null) {
    return null;
  }

  return (
    <Badge variant={statusBadgeVariants[status]}>
      {formatComprobanteStatusLabel(status)}
    </Badge>
  );
}

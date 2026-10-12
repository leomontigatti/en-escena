import { Badge } from "@/components/ui/badge";
import type { ComprobanteStatus } from "@/lib/comprobantes/comprobante-status.server";
import { formatComprobanteStatusLabel } from "@/lib/comprobantes/format";

/** Whether the comprobante is in force, as the list and the detail show it. */
export function ComprobanteStatusBadge({
  status,
}: {
  status: ComprobanteStatus;
}) {
  return (
    <Badge variant={status === "valid" ? "success" : "destructive"}>
      {formatComprobanteStatusLabel(status)}
    </Badge>
  );
}

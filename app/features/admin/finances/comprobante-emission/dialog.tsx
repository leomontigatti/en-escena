import { Check } from "lucide-react";

import { ArcaConfirmationDialog } from "@/components/shared/arca-confirmation-dialog";
import { formatAmount } from "@/lib/finances/formatters";

import {
  emitComprobanteConfirmValue,
  emitComprobanteIntent,
  recheckComprobanteIntent,
} from "./shared";

/**
 * Emission confirmation (#480, ADR-0011). The amount arrives derived from
 * what was collected, so the operator cannot emit for a different figure: the
 * dialog only previews, and is then confirmed or cancelled.
 *
 * Driven from the header's actions menu (ADR-0011): the `Emitir factura`
 * affordance is an item of the `ResourceActionsMenu`, not a separate button, and
 * it only mounts when there is a remainder left to bill.
 */
export function EmissionDialog({
  billableAmount,
  open,
  onOpenChange,
}: {
  billableAmount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <ArcaConfirmationDialog
      confirmIcon={Check}
      confirmLabel="Emitir"
      confirmValue={emitComprobanteConfirmValue}
      description={`Vas a emitir una factura C por ${formatAmount(billableAmount)}. Una vez emitida, sólo puede revertirse con una nota de crédito.`}
      intent={emitComprobanteIntent}
      onOpenChange={onOpenChange}
      open={open}
      recheckIntent={recheckComprobanteIntent}
      title="¿Emitir la Factura C?"
      toastId="comprobante-emission:error"
    >
      <EmissionPreview billableAmount={billableAmount} />
    </ArcaConfirmationDialog>
  );
}

/**
 * What is about to be billed. It states the derived amount plus the
 * comprobante's frozen domain rules (#320): an anonymous final-consumer receptor
 * and an issuer exempt from IVA.
 */
function EmissionPreview({ billableAmount }: { billableAmount: number }) {
  return (
    <div className="flex flex-col gap-2 rounded-md border bg-muted/50 px-3 py-2">
      <PreviewRow label="Comprobante" value="Factura C" />
      <PreviewRow label="Receptor" value="Consumidor final" />
      <PreviewRow label="Emisor" value="Exento de IVA" />
      <PreviewRow
        label="Total a facturar"
        strong
        value={formatAmount(billableAmount)}
      />
    </div>
  );
}

function PreviewRow({
  label,
  strong = false,
  value,
}: {
  label: string;
  strong?: boolean;
  value: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={
          strong ? "text-sm font-medium tabular-nums" : "text-sm tabular-nums"
        }
      >
        {value}
      </span>
    </div>
  );
}

import { Check } from "lucide-react";

import { ArcaConfirmationDialog } from "@/components/shared/arca-confirmation-dialog";
import { formatAmount } from "@/lib/finances/formatters";
import {
  comprobanteKindCbteTipo,
  formatComprobanteKindLabel,
} from "@/lib/comprobantes/kind";
import { lowercaseFirst } from "@/lib/shared/utils";

import {
  emitComprobanteConfirmValue,
  emitComprobanteIntent,
  recheckComprobanteIntent,
  type AnchorInvoicing,
} from "./shared";

type ReadyInvoicing = Extract<AnchorInvoicing, { status: "ready" }>;

/**
 * Emission confirmation (ADR-0011, ADR-0014 §5). The document and its amount
 * arrive derived from what the unit owes against what it already documents,
 * so the operator cannot emit another figure: the dialog only previews, and is
 * then confirmed or cancelled.
 *
 * Driven from the header's actions menu (ADR-0011): the `Emitir` affordance is
 * an item of the `ResourceActionsMenu`, not a separate button, and it only
 * mounts when the unit owes a document.
 */
export function EmissionDialog({
  invoicing,
  open,
  onOpenChange,
}: {
  invoicing: ReadyInvoicing;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const label = formatComprobanteKindLabel(
    comprobanteKindCbteTipo(invoicing.kind),
  );

  return (
    <ArcaConfirmationDialog
      confirmIcon={Check}
      confirmLabel="Emitir"
      confirmValue={emitComprobanteConfirmValue}
      description={`Vas a emitir una ${lowercaseFirst(label)} por ${formatAmount(invoicing.amount)}. ${irreversibilityNotes[invoicing.kind]}`}
      intent={emitComprobanteIntent}
      onOpenChange={onOpenChange}
      open={open}
      recheckIntent={recheckComprobanteIntent}
      title={`¿Emitir la ${label}?`}
      toastId="comprobante-emission:error"
    >
      <EmissionPreview invoicing={invoicing} label={label} />
    </ArcaConfirmationDialog>
  );
}

// What undoes the document once it carries a CAE: a later note, never an edit.
const irreversibilityNotes: Record<ReadyInvoicing["kind"], string> = {
  factura_c:
    "Una vez emitida, sólo una nota de crédito puede acreditar lo facturado.",
  nota_debito_c:
    "Una vez emitida, sólo una nota de crédito puede acreditar lo debitado.",
  nota_credito_c:
    "Una vez emitida, sólo una nota de débito puede volver a facturar lo acreditado.",
};

/**
 * What is about to be emitted. It states the derived amount plus the
 * comprobante's frozen domain rules (#320): an anonymous final-consumer receptor
 * and an issuer exempt from IVA.
 */
function EmissionPreview({
  invoicing,
  label,
}: {
  invoicing: ReadyInvoicing;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-md border bg-muted/50 px-3 py-2">
      <PreviewRow label="Comprobante" value={label} />
      <PreviewRow label="Receptor" value="Consumidor final" />
      <PreviewRow label="Emisor" value="Exento de IVA" />
      <PreviewRow
        label={
          invoicing.kind === "nota_credito_c"
            ? "Total a acreditar"
            : "Total a facturar"
        }
        strong
        value={formatAmount(invoicing.amount)}
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

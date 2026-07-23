import { AlertTriangle, Check, LoaderCircle, ReceiptText } from "lucide-react";
import { useState } from "react";
import { useFetcher } from "react-router";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ContingencyAlert } from "@/features/admin/comprobantes/contingency-alert";

import { formatAmount } from "../formatters";
import type { ChoreographyInvoicing, ComprobanteCurrency } from "./server";
import {
  emitComprobanteConfirmValue,
  emitComprobanteIntent,
  type ChoreographyFinanceActionData,
} from "./shared";

type LastComprobante = NonNullable<ChoreographyInvoicing["lastComprobante"]>;

/**
 * Eje de emisión del detalle financiero (prototipo B de #339): la última factura
 * emitida con su badge Vigente/Desactualizada frente al monto vigente de la
 * coreografía y la afordancia para emitir el remanente cobrado. La emisión pasa
 * siempre por un diálogo de preview con confirmación irreversible.
 */
export function ComprobantesSection({
  invoicing,
}: {
  invoicing: ChoreographyInvoicing;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Card aria-label="Comprobantes">
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">Facturación electrónica</span>
            {invoicing.lastComprobante ? (
              <LastComprobanteSummary comprobante={invoicing.lastComprobante} />
            ) : (
              <span className="text-sm text-muted-foreground">
                Esta coreografía todavía no tiene comprobantes emitidos.
              </span>
            )}
          </div>
          {invoicing.currency ? (
            <CurrencyBadge currency={invoicing.currency} />
          ) : null}
        </div>

        {invoicing.canEmit ? (
          <>
            <div>
              <Button type="button" onClick={() => setOpen(true)}>
                <ReceiptText aria-hidden="true" data-icon="inline-start" />
                Emitir comprobante
              </Button>
            </div>
            <EmissionDialog
              billableAmount={invoicing.billableAmount}
              open={open}
              onOpenChange={setOpen}
            />
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function CurrencyBadge({ currency }: { currency: ComprobanteCurrency }) {
  return currency === "vigente" ? (
    <Badge variant="success">Vigente</Badge>
  ) : (
    <Badge variant="warning">Desactualizada</Badge>
  );
}

function LastComprobanteSummary({
  comprobante,
}: {
  comprobante: LastComprobante;
}) {
  return (
    <div className="flex flex-col gap-0.5 text-sm text-muted-foreground">
      <span className="tabular-nums">
        Factura C {formatComprobanteNumber(comprobante)} ·{" "}
        {formatAmount(comprobante.impTotal)}
      </span>
      <span className="tabular-nums">CAE {comprobante.cae}</span>
      {comprobante.status === "anulada" ? (
        <span className="text-destructive">Anulada por nota de crédito.</span>
      ) : null}
    </div>
  );
}

function EmissionDialog({
  billableAmount,
  open,
  onOpenChange,
}: {
  billableAmount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const fetcher = useFetcher<ChoreographyFinanceActionData>();
  const [confirmed, setConfirmed] = useState(false);
  const isSaving = fetcher.state !== "idle";
  const contingency =
    fetcher.data?.status === "emission-error" ? fetcher.data : null;
  const genericError =
    fetcher.data?.status === "error" ? fetcher.data.message : null;

  function handleOpenChange(next: boolean) {
    if (isSaving) {
      return;
    }
    if (!next) {
      setConfirmed(false);
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent overlayClassName="backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle>Emitir Factura C</DialogTitle>
          <DialogDescription>
            Revisá el detalle antes de emitir. La emisión es irreversible.
          </DialogDescription>
        </DialogHeader>

        <fetcher.Form method="post" className="flex flex-col gap-4">
          <input type="hidden" name="intent" value={emitComprobanteIntent} />

          <EmissionPreview billableAmount={billableAmount} />

          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              className="mt-0.5"
              name="confirm"
              value={emitComprobanteConfirmValue}
              aria-label="Confirmo que la emisión es irreversible"
              checked={confirmed}
              onCheckedChange={(value) => setConfirmed(value === true)}
              disabled={isSaving}
            />
            <span>
              Confirmo que la emisión del comprobante es irreversible y no puede
              deshacerse.
            </span>
          </label>

          {contingency ? (
            <ContingencyAlert
              message={contingency.message}
              contingency={contingency.contingency}
            />
          ) : null}

          {genericError ? (
            <Alert variant="destructive">
              <AlertTriangle aria-hidden="true" />
              <AlertDescription>{genericError}</AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isSaving}>
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!confirmed || isSaving}>
              {isSaving ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="animate-spin"
                  data-icon="inline-start"
                />
              ) : (
                <Check aria-hidden="true" data-icon="inline-start" />
              )}
              Confirmar emisión
            </Button>
          </DialogFooter>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Detalle a facturar. Enuncia las reglas de dominio congeladas del comprobante
 * (#320): receptor consumidor final anónimo y emisor exento frente al IVA, más
 * el total que se va a facturar.
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

function formatComprobanteNumber(comprobante: {
  ptoVta: number;
  cbteNro: number;
}): string {
  const ptoVta = String(comprobante.ptoVta).padStart(4, "0");
  const cbteNro = String(comprobante.cbteNro).padStart(8, "0");
  return `${ptoVta}-${cbteNro}`;
}

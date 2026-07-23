import { AlertTriangle, Check, LoaderCircle, ReceiptText } from "lucide-react";
import { useState } from "react";
import { useFetcher } from "react-router";

import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ComprobantePorcion } from "@/lib/comprobantes/emit-factura-c.server";

import { formatAmount } from "../formatters";
import type { ChoreographyInvoicing, ComprobanteCurrency } from "./server";
import {
  emitComprobanteConfirmValue,
  emitComprobanteIntent,
  type ArcaContingency,
  type ChoreographyFinanceActionData,
} from "./shared";

type LastComprobante = NonNullable<ChoreographyInvoicing["lastComprobante"]>;

/**
 * Eje de emisión del detalle financiero (prototipo B de #339): la última factura
 * emitida con su badge Vigente/Desactualizada frente al monto vigente de la
 * coreografía y la única acción `Emitir factura`, habilitada sólo cuando hay un
 * remanente cobrado sin facturar. La operadora no elige porción ni importe: ambos
 * se derivan de lo cobrado (#480, ADR-0011) y se previsualizan antes de confirmar
 * en un `AlertDialog` cuyo copy dice la verdad (la salida real es una Nota de
 * crédito, no un borrado).
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

        <div>
          <Button
            type="button"
            disabled={!invoicing.canEmit}
            onClick={() => setOpen(true)}
          >
            <ReceiptText aria-hidden="true" data-icon="inline-start" />
            Emitir factura
          </Button>
        </div>
        {invoicing.canEmit ? (
          <EmissionDialog
            billableAmount={invoicing.billableAmount}
            porcion={invoicing.porcion}
            open={open}
            onOpenChange={setOpen}
          />
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

/**
 * Confirmación de emisión como `AlertDialog` (#480, ADR-0011): foco atrapado, no
 * se cierra al clickear afuera y expone `role="alertdialog"`. Sin checkbox: la
 * confirmación es el diálogo mismo. La porción y el importe llegan derivados de
 * lo cobrado, así que la operadora no puede emitir por otro monto ni elegir otra
 * porción; sólo previsualiza y confirma o cancela. El `confirm` viaja como campo
 * oculto —palabra clave de submit deliberado que el server exige— no como tilde.
 */
function EmissionDialog({
  billableAmount,
  porcion,
  open,
  onOpenChange,
}: {
  billableAmount: number;
  porcion: ComprobantePorcion | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const fetcher = useFetcher<ChoreographyFinanceActionData>();
  const isSaving = fetcher.state !== "idle";
  const contingency =
    fetcher.data?.status === "emission-error" ? fetcher.data : null;
  const genericError =
    fetcher.data?.status === "error" ? fetcher.data.message : null;

  function handleOpenChange(next: boolean) {
    if (isSaving) {
      return;
    }
    onOpenChange(next);
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Emitir Factura C</AlertDialogTitle>
          <AlertDialogDescription>
            Vas a emitir una Factura C por {formatAmount(billableAmount)} (
            {porcionLabel(porcion)}). Una vez emitida, sólo puede revertirse con
            una Nota de crédito.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <fetcher.Form method="post" className="flex flex-col gap-4">
          <input type="hidden" name="intent" value={emitComprobanteIntent} />
          <input
            type="hidden"
            name="confirm"
            value={emitComprobanteConfirmValue}
          />

          <EmissionPreview billableAmount={billableAmount} porcion={porcion} />

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

          <AlertDialogFooter>
            <AlertDialogCancel type="button" disabled={isSaving}>
              Cancelar
            </AlertDialogCancel>
            <Button type="submit" disabled={isSaving}>
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
          </AlertDialogFooter>
        </fetcher.Form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Detalle a facturar. Enuncia la porción derivada y el importe, más las reglas de
 * dominio congeladas del comprobante (#320): receptor consumidor final anónimo y
 * emisor exento frente al IVA.
 */
function EmissionPreview({
  billableAmount,
  porcion,
}: {
  billableAmount: number;
  porcion: ComprobantePorcion | null;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-md border bg-muted/50 px-3 py-2">
      <PreviewRow label="Comprobante" value="Factura C" />
      <PreviewRow label="Porción" value={porcionLabel(porcion)} />
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

/**
 * Etiqueta legible de la porción derivada. `null` no debería llegar acá (el
 * diálogo sólo se monta con remanente por facturar), pero se rotula defensivo.
 */
function porcionLabel(porcion: ComprobantePorcion | null): string {
  switch (porcion) {
    case "seña":
      return "Seña";
    case "saldo":
      return "Saldo";
    case "total":
      return "Total";
    default:
      return "—";
  }
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

/**
 * Estado de contingencia de ARCA. Presenta el mensaje general y cada error u
 * observación crudos: la emisión no se completó y no se persistió nada, así que
 * la operadora puede reintentar sin que la UI quede en un estado inconsistente.
 */
export function ContingencyAlert({
  contingency,
  message,
}: {
  contingency: ArcaContingency;
  message: string;
}) {
  return (
    <Alert variant="destructive">
      <AlertTriangle aria-hidden="true" />
      <AlertDescription>
        <div className="flex flex-col gap-1">
          <span>{message}</span>
          {contingency.errors.map((error) => (
            <span key={error}>{error}</span>
          ))}
          {contingency.observaciones.map((observacion) => (
            <span key={observacion}>{observacion}</span>
          ))}
        </div>
      </AlertDescription>
    </Alert>
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

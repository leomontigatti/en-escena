/**
 * PROTOTIPO #339 — diálogo de anulación con Nota de crédito C (total-only, sin
 * motivo; libera la porción). Compartido por las 3 variantes. Throwaway.
 */

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { PreviewRow } from "./detail-shared";
import {
  formatAmount,
  formatComprobanteNumero,
  porcionLabel,
  tipoComprobanteLabel,
  type StubComprobante,
} from "./stub";

export function AnularDialog({
  comprobante,
  open,
  onOpenChange,
  onAnular,
}: {
  comprobante: StubComprobante;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onAnular: (id: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Anular con Nota de crédito</DialogTitle>
          <DialogDescription>
            Se emite una Nota de crédito C espejo (cód. 13) por el total del
            comprobante{" "}
            {formatComprobanteNumero(comprobante.ptoVta, comprobante.cbteNro)}.
            La anulación es total e irreversible; libera la porción para volver
            a facturarla. No afecta el estado financiero de la coreografía.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-md border bg-muted/50 p-3 text-sm">
          <PreviewRow
            label="Anula"
            value={`${tipoComprobanteLabel(comprobante.tipoComprobante)} ${formatComprobanteNumero(comprobante.ptoVta, comprobante.cbteNro)}`}
          />
          <PreviewRow
            label="Porción"
            value={porcionLabel(comprobante.porcion)}
          />
          <PreviewRow
            label="Importe"
            value={
              <span className="tabular-nums">
                {formatAmount(comprobante.impTotalSnapshot)}
              </span>
            }
          />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancelar
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              onAnular(comprobante.id);
              onOpenChange(false);
            }}
          >
            Anular con NC
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

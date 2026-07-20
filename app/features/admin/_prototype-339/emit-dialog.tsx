/**
 * PROTOTIPO #339 — diálogo de emisión de Factura C para una porción concreta
 * (disparado por "Facturar seña" / "Facturar saldo"): previsualización,
 * confirmación irreversible y UX de contingencia (rechazo / timeout de ARCA).
 * Throwaway.
 */

import { AlertTriangle, LoaderCircle, Receipt, RefreshCcw } from "lucide-react";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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

import { PreviewRow, type SimResult } from "./detail-shared";
import { formatAmount, porcionLabel, type PortionKey } from "./stub";

export type EmitTarget = { porcion: PortionKey; monto: number };

export function EmitDialog({
  target,
  open,
  onOpenChange,
  onEmit,
}: {
  target: EmitTarget | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onEmit: (p: PortionKey) => void;
}) {
  const [sim, setSim] = useState<SimResult>("exito");
  const [phase, setPhase] = useState<"form" | "sending" | "error">("form");

  function reset() {
    setSim("exito");
    setPhase("form");
  }

  function confirm() {
    if (!target) return;
    setPhase("sending");
    window.setTimeout(() => {
      if (sim === "exito") {
        onEmit(target.porcion);
        onOpenChange(false);
        reset();
      } else {
        setPhase("error");
      }
    }, 700);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (phase === "sending") return;
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent overlayClassName="backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle>
            Facturar {target ? porcionLabel(target.porcion).toLowerCase() : ""}{" "}
            — Factura C
          </DialogTitle>
          <DialogDescription>
            El comprobante es inmutable: una vez que ARCA otorga el CAE no se
            edita ni se borra. Para corregir hay que anular con Nota de crédito.
          </DialogDescription>
        </DialogHeader>

        {phase === "error" ? (
          <EmitErrorState sim={sim} onRetry={() => setPhase("form")} />
        ) : (
          <div className="flex flex-col gap-4">
            {target ? (
              <div className="flex flex-col gap-1.5 rounded-md border bg-muted/50 p-3 text-sm">
                <PreviewRow
                  label="Tipo"
                  value={<Badge variant="info">Factura C (cód. 11)</Badge>}
                />
                <PreviewRow
                  label="Porción"
                  value={porcionLabel(target.porcion)}
                />
                <PreviewRow
                  label="Importe (ImpTotal)"
                  value={
                    <span className="font-medium tabular-nums">
                      {formatAmount(target.monto)}
                    </span>
                  }
                />
                <PreviewRow
                  label="Receptor"
                  value="Consumidor final — DocTipo 99 / DocNro 0"
                />
                <PreviewRow label="Leyenda" value="A CONSUMIDOR FINAL" />
              </div>
            ) : null}

            {/* Control de prototipo: simular respuesta de ARCA (concern #4). */}
            <label className="flex items-center gap-2 rounded-md border border-dashed border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground">
              <span className="font-semibold">[proto]</span> Simular respuesta
              ARCA:
              <select
                className="ml-auto rounded border bg-background px-1.5 py-0.5 text-foreground"
                value={sim}
                onChange={(e) => setSim(e.target.value as SimResult)}
              >
                <option value="exito">CAE otorgado</option>
                <option value="rechazo">Rechazo (observación)</option>
                <option value="timeout">Timeout / sin respuesta</option>
              </select>
            </label>

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancelar
                </Button>
              </DialogClose>
              <Button
                type="button"
                disabled={!target || phase === "sending"}
                onClick={confirm}
              >
                {phase === "sending" ? (
                  <LoaderCircle
                    className="animate-spin"
                    data-icon="inline-start"
                  />
                ) : (
                  <Receipt data-icon="inline-start" />
                )}
                Emitir (irreversible)
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EmitErrorState({
  sim,
  onRetry,
}: {
  sim: SimResult;
  onRetry: () => void;
}) {
  const isTimeout = sim === "timeout";
  return (
    <div className="flex flex-col gap-4">
      <Alert variant="destructive">
        <AlertTriangle aria-hidden="true" />
        <AlertTitle>
          {isTimeout
            ? "ARCA no respondió a tiempo"
            : "ARCA rechazó el comprobante"}
        </AlertTitle>
        <AlertDescription>
          {isTimeout
            ? "No se recibió CAE. No se generó ningún comprobante: podés reintentar sin riesgo de duplicar. Si el problema persiste, la porción queda sin facturar."
            : "Observación 10016: el importe no cumple una validación. No se generó comprobante. Revisá los datos y reintentá."}
        </AlertDescription>
      </Alert>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cerrar
          </Button>
        </DialogClose>
        <Button type="button" onClick={onRetry}>
          <RefreshCcw data-icon="inline-start" />
          Reintentar
        </Button>
      </DialogFooter>
    </div>
  );
}

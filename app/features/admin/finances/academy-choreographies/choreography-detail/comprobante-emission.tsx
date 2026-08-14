import { AlertTriangle, Check, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
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
import { Button } from "@/components/ui/button";
import {
  ContingencyAlert,
  contingencyCancelLabel,
  resolveContingencySubmitState,
} from "@/lib/comprobantes/contingency-alert";

import { formatAmount } from "../../formatters";
import {
  emitComprobanteConfirmValue,
  emitComprobanteIntent,
  recheckComprobanteIntent,
  type ChoreographyFinanceActionData,
} from "./shared";

/**
 * Emission confirmation as an `AlertDialog` (#480, ADR-0011): focus is trapped,
 * it does not close on an outside click and it exposes `role="alertdialog"`. No
 * checkbox: the dialog itself is the confirmation. The amount arrives derived
 * from what was collected, so the operator cannot emit for a different figure:
 * the dialog only previews, and is then confirmed or cancelled. The `confirm`
 * travels as a hidden field — the deliberate-submit keyword the server requires
 * — not as a tick.
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
  const fetcher = useFetcher<ChoreographyFinanceActionData>();
  const isSaving = fetcher.state !== "idle";
  const contingency =
    fetcher.data?.status === "contingency" ? fetcher.data.contingency : null;
  const genericError =
    fetcher.data?.status === "error" ? fetcher.data.message : null;

  // La verificación manual la declara el operador, así que no puede sobrevivir a
  // un intento nuevo: cada respuesta del server la borra y el reintento vuelve a
  // quedar bloqueado si sigue sin resolverse.
  const [acknowledged, setAcknowledged] = useState(false);
  useEffect(() => {
    setAcknowledged(false);
  }, [fetcher.data]);

  const submitState = resolveContingencySubmitState(contingency, acknowledged);

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
            Vas a emitir una factura C por {formatAmount(billableAmount)}. Una
            vez emitida, sólo puede revertirse con una nota de crédito.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <fetcher.Form method="post" className="flex flex-col gap-4">
          <input type="hidden" name="intent" value={emitComprobanteIntent} />
          <input
            type="hidden"
            name="confirm"
            value={emitComprobanteConfirmValue}
          />

          <EmissionPreview billableAmount={billableAmount} />

          {contingency ? (
            <ContingencyAlert
              acknowledged={acknowledged}
              contingency={contingency}
              isBusy={isSaving}
              onAcknowledge={() => setAcknowledged(true)}
              onRecheck={(payload) =>
                fetcher.submit(payload, { method: "post" })
              }
              recheckIntent={recheckComprobanteIntent}
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
              {contingencyCancelLabel(submitState)}
            </AlertDialogCancel>
            {/* Recuperado: el comprobante ya está autorizado y registrado, así
                que el botón se saca. Deshabilitarlo se leería como "esperá" e
                invitaría a un reintento que emitiría un segundo comprobante. */}
            {submitState === "removed" ? null : (
              <Button
                type="submit"
                disabled={isSaving || submitState === "blocked"}
              >
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
            )}
          </AlertDialogFooter>
        </fetcher.Form>
      </AlertDialogContent>
    </AlertDialog>
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

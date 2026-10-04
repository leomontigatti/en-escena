/**
 * The money dialog's half of the `Bonificada` waiver (ADR-0017): the shape a
 * waived inscription opens on, and why `Bonificar` cannot run on a row that
 * holds money. Only the choreography detail reaches them.
 */

import { Info } from "lucide-react";
import { useState } from "react";

import { BlockedActionDialog } from "@/components/shared/blocked-action-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { formatAmount, formatDancerName } from "@/lib/finances/formatters";

import { MoneyDialog } from "./dialog-parts";
import type { InscriptionRow } from "./figures";

/**
 * The `Bonificada` waiver's two ways in (ADR-0017). Each one hands over to the
 * caller's confirmation rather than growing a confirm shape here. Only the
 * choreography detail passes it: a seminar inscription has no waiver.
 */
export type InscriptionMoneyWaiver = {
  onUnwaive: () => void;
  onWaive: () => void;
};

/**
 * A waived inscription (`Bonificada`): it owes nothing and takes no money, so
 * there is nothing to type. `Quitar bonificación` hands over to the caller's
 * confirmation; it is `destructive` because it reverses the waiver.
 */
export function WaivedInscriptionDialog({
  inscription,
  onOpenChange,
  onUnwaive,
}: {
  inscription: InscriptionRow;
  onOpenChange: (open: boolean) => void;
  onUnwaive: (() => void) | null;
}) {
  return (
    <MoneyDialog
      description="Inscripción bonificada: no adeuda nada."
      isDirty={false}
      isSaving={false}
      onOpenChange={onOpenChange}
      title={formatDancerName(inscription)}
    >
      {(requestClose) => (
        <div className="flex flex-col gap-4">
          <Alert variant="info">
            <Info aria-hidden="true" />
            <AlertTitle>Inscripción bonificada</AlertTitle>
            <AlertDescription>
              No se le puede asignar dinero. Para cobrarla, quitá la
              bonificación.
            </AlertDescription>
          </Alert>
          <DialogFooter className={onUnwaive ? "sm:justify-between" : ""}>
            {onUnwaive ? (
              <Button type="button" variant="destructive" onClick={onUnwaive}>
                Quitar bonificación
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={requestClose}>
              Cerrar
            </Button>
          </DialogFooter>
        </div>
      )}
    </MoneyDialog>
  );
}

/**
 * `Bonificar`'s click on the allocate shape: the waiver itself on a row with no
 * money, and otherwise the acknowledgment below, which says how to clear it.
 * `null` when the row cannot be waived at all.
 */
export function useWaiverGesture({
  allocatedAmount,
  onWaive,
}: {
  allocatedAmount: number;
  onWaive: (() => void) | null;
}) {
  const [open, setOpen] = useState(false);
  const openBlocked = () => setOpen(true);
  const waiveOrExplain = allocatedAmount > 0 ? openBlocked : onWaive;

  return {
    blockedDialog: { onOpenChange: setOpen, open },
    waive: onWaive ? waiveOrExplain : null,
  };
}

/**
 * What `Bonificar` opens on a row that holds money, instead of the waiver: a
 * waived inscription holds no money, so what it has has to come off first.
 * Taking it off is `Quitar dinero`, in the same dialog. The button stays
 * enabled (style guide, Detail pages); the server refuses all the same.
 */
export function WaiverBlockedDialog({
  allocatedAmount,
  onOpenChange,
  open,
}: {
  allocatedAmount: number;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  return (
    <BlockedActionDialog
      description="Para bonificarla, primero quitá su dinero. Al quitarlo vuelve al saldo disponible de la academia."
      onOpenChange={onOpenChange}
      open={open}
      reasons={`Tiene ${formatAmount(allocatedAmount)} asignados.`}
      reasonsTitle="Tiene dinero asignado"
      title="No se puede bonificar la inscripción"
    />
  );
}

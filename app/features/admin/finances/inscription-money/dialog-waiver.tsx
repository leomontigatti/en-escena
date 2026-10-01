/**
 * The money dialog's half of the `Bonificada` waiver (ADR-0017): the shape a
 * waived inscription opens on, and why `Bonificar` is disabled on a row that
 * holds money. Only the choreography detail reaches them.
 */

import { Info } from "lucide-react";

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
 * Why `Bonificar` is disabled: a waived inscription holds no money, so what it
 * has has to come off first. Taking it off is `Quitar dinero`, right below.
 */
export function WaiverBlockedAlert({
  allocatedAmount,
}: {
  allocatedAmount: number;
}) {
  return (
    <Alert variant="info">
      <Info aria-hidden="true" />
      <AlertTitle>Para bonificarla, quitá su dinero</AlertTitle>
      <AlertDescription>
        Tiene {formatAmount(allocatedAmount)} asignados. Al quitarlos vuelven al
        saldo disponible de la academia.
      </AlertDescription>
    </Alert>
  );
}

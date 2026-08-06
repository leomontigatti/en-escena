/**
 * THROWAWAY PROTOTYPE — ticket #550's escape hatch.
 *
 * Putting an arbitrary amount on one inscription by hand. This is the
 * exceptional case: the presets are the common one, and they do not ask for an
 * amount at all — `Pagar seña` already means `owedDepositAmount`.
 *
 * **There is no payment picker.** The admin draws from the academy's
 * `Saldo disponible`; which payments fund it is the fill rule's business
 * (`spreadFromPool`). The price picker does live here, because without a chosen
 * price there is no figure to measure against — and it always opens on a real
 * price, since `selectedPriceId` is never null.
 */
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";

import type { AllocationRejection } from "./allocation-rules";
import type { InscriptionReading, PrototypeState } from "./fixtures";
import { PriceSelect } from "./price-select";

export function ManualAllocateDialog({
  inscription,
  state,
  choreographyGroupType,
  onClose,
  onSelectPrice,
  onAllocate,
}: {
  inscription: InscriptionReading | null;
  state: PrototypeState;
  choreographyGroupType: string;
  onClose: () => void;
  onSelectPrice: (inscriptionId: string, priceId: string) => void;
  onAllocate: (
    inscriptionId: string,
    amount: number,
  ) => AllocationRejection | null;
}) {
  const [amount, setAmount] = useState("");
  const [rejection, setRejection] = useState<AllocationRejection | null>(null);

  if (inscription === null) {
    return null;
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Asignación individual · {inscription.dancerName}
          </DialogTitle>
          <DialogDescription>
            Podés elegir el precio para la inscripción y agregar pagos.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="precio">Precio</FieldLabel>
            <PriceSelect
              id="precio"
              inscription={inscription}
              state={state}
              choreographyGroupType={choreographyGroupType}
              onSelectPrice={onSelectPrice}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="monto">Monto</FieldLabel>
            <Input
              id="monto"
              inputMode="numeric"
              className="tabular-nums"
              value={amount}
              onChange={(event) =>
                setAmount(event.target.value.replace(/\D/g, ""))
              }
            />
          </Field>
          {rejection !== null ? (
            <Alert variant="destructive">
              <AlertDescription>{rejection.message}</AlertDescription>
            </Alert>
          ) : null}
        </FieldGroup>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={amount === ""}
            onClick={() => {
              const next = onAllocate(inscription.id, Number(amount));
              setRejection(next);

              // The refusal keeps the dialog open with the amount still typed:
              // #549 rejects on the write path, and the admin has to see what
              // the figure actually allows before retrying.
              if (next === null) {
                setAmount("");
                onClose();
              }
            }}
          >
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

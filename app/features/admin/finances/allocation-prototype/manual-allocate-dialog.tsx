/**
 * THROWAWAY PROTOTYPE — ticket #550's escape hatch.
 *
 * Allocating an arbitrary amount of one payment to one inscription by hand. This
 * is the exceptional case: the presets are the common one. The price picker lives
 * here too, because without a chosen price there is no figure to measure against.
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { formatAmount } from "../formatters";
import type {
  InscriptionReading,
  PaymentReading,
  PrototypeState,
} from "./fixtures";
import type { AllocationVariantProps } from "./shared";

export function ManualAllocateDialog({
  inscription,
  state,
  payments,
  onClose,
  onSelectPrice,
  onAllocate,
}: {
  inscription: InscriptionReading | null;
  state: PrototypeState;
  payments: PaymentReading[];
  onClose: () => void;
  onSelectPrice: AllocationVariantProps["onSelectPrice"];
  onAllocate: AllocationVariantProps["onAllocate"];
}) {
  const [paymentId, setPaymentId] = useState("");
  const [amount, setAmount] = useState("");

  if (inscription === null) {
    return null;
  }

  const existing =
    inscription.allocations.find(
      (allocation) => allocation.paymentId === paymentId,
    )?.amount ?? 0;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Asignar a mano · {inscription.dancerName}</DialogTitle>
          <DialogDescription>
            El monto reemplaza lo que esta inscripción ya tenga de ese pago.
            Cero borra la asignación.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="precio">Precio elegido</FieldLabel>
            <Select
              value={inscription.selectedPriceId ?? ""}
              onValueChange={(value) => onSelectPrice(inscription.id, value)}
            >
              <SelectTrigger id="precio" className="w-full">
                <SelectValue placeholder="Elegí un precio" />
              </SelectTrigger>
              <SelectContent>
                {state.prices.map((price) => (
                  <SelectItem key={price.id} value={price.id}>
                    {price.name} · {formatAmount(price.amount)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="pago">Pago</FieldLabel>
            <Select value={paymentId} onValueChange={setPaymentId}>
              <SelectTrigger id="pago" className="w-full">
                <SelectValue placeholder="Elegí un pago" />
              </SelectTrigger>
              <SelectContent>
                {payments.map((payment) => (
                  <SelectItem key={payment.id} value={payment.id}>
                    Pago #{payment.number} · disponible{" "}
                    {formatAmount(payment.availableAmount)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            {paymentId !== "" ? (
              <p className="text-xs text-muted-foreground tabular-nums">
                Hoy tiene {formatAmount(existing)} de este pago.
              </p>
            ) : null}
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={paymentId === "" || amount === ""}
            onClick={() => {
              onAllocate(paymentId, inscription.id, Number(amount));
              setAmount("");
              onClose();
            }}
          >
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

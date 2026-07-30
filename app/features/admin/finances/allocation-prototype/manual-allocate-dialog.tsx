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
import { Alert, AlertDescription } from "@/components/ui/alert";

import { formatAmount } from "../formatters";
import type { AllocationRejection, RepickPolicy } from "./allocation-rules";
import type {
  InscriptionReading,
  PaymentReading,
  PrototypeState,
} from "./fixtures";
import { PriceSelect } from "./price-select";
import type { AllocationVariantProps } from "./shared";

export function ManualAllocateDialog({
  inscription,
  state,
  choreographyGroupType,
  payments,
  repickPolicy,
  onClose,
  onSelectPrice,
  onAllocate,
}: {
  inscription: InscriptionReading | null;
  state: PrototypeState;
  choreographyGroupType: string;
  payments: PaymentReading[];
  repickPolicy: RepickPolicy;
  onClose: () => void;
  onSelectPrice: AllocationVariantProps["onSelectPrice"];
  onAllocate: AllocationVariantProps["onAllocate"];
}) {
  const [paymentId, setPaymentId] = useState("");
  const [amount, setAmount] = useState("");
  const [rejection, setRejection] = useState<AllocationRejection | null>(null);

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
            Cero borra la asignación, y si era la última, el precio elegido se
            limpia.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="precio">Precio elegido</FieldLabel>
            <PriceSelect
              id="precio"
              inscription={inscription}
              state={state}
              choreographyGroupType={choreographyGroupType}
              repickPolicy={repickPolicy}
              onSelectPrice={onSelectPrice}
            />
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
                {inscription.owedBalanceAmount === null
                  ? ""
                  : ` Admite hasta ${formatAmount(existing + inscription.owedBalanceAmount)} sin sobreasignar.`}
              </p>
            ) : null}
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
            disabled={
              paymentId === "" ||
              amount === "" ||
              inscription.selectedPriceId === null
            }
            onClick={() => {
              const next = onAllocate(
                paymentId,
                inscription.id,
                Number(amount),
              );
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

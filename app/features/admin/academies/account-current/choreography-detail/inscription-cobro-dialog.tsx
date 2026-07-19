import { AlertTriangle, Check, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { useFetcher } from "react-router";

import { Alert, AlertDescription } from "@/components/ui/alert";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatPaymentNumber } from "@/lib/finances/payment-number";

import { formatAmount, formatDate } from "../formatters";
import type { loadAdministrativeChoreographyFinanceDetail } from "./server";
import { payInscriptionDepositIntent } from "./shared";

type ChoreographyFinanceDetailLoaderData = Awaited<
  ReturnType<typeof loadAdministrativeChoreographyFinanceDetail>
>;
type InscriptionRow =
  ChoreographyFinanceDetailLoaderData["inscriptions"][number];
type PaymentRow = ChoreographyFinanceDetailLoaderData["payments"][number];
type InscriptionDepositOptions = NonNullable<
  ChoreographyFinanceDetailLoaderData["inscriptionDeposit"]
>;
type InscriptionPriceRow = InscriptionDepositOptions["priceRows"][number];

export function formatDancerName(input: {
  firstName: string;
  lastName: string;
}) {
  return `${input.firstName} ${input.lastName}`;
}

/**
 * Diálogo por fila del cobro extraordinario de seña de una huérfana: elegir una
 * fila de precio (acotada por el piso, ya filtrada en el loader) y un pago con
 * disponible suficiente para la seña de esa fila. El server vuelve a validar el
 * piso y la disponibilidad.
 */
export function InscriptionCobroDialog({
  inscription,
  open,
  onOpenChange,
  priceRows,
  payments,
}: {
  inscription: InscriptionRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  priceRows: InscriptionPriceRow[];
  payments: PaymentRow[];
}) {
  const fetcher = useFetcher<{ status: "error"; message: string }>();
  const [selectedPriceId, setSelectedPriceId] = useState<string | null>(null);
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(
    null,
  );
  const isSaving = fetcher.state !== "idle";
  const selectedPrice =
    priceRows.find((price) => price.id === selectedPriceId) ?? null;
  const payableForSelectedPrice = payments.filter(
    (payment) =>
      selectedPrice !== null &&
      payment.availableAmount >= selectedPrice.depositAmount,
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !isSaving && onOpenChange(next)}
    >
      <DialogContent overlayClassName="backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle>Asignar seña</DialogTitle>
          <DialogDescription>
            Elegí el precio y el pago para señar la inscripción.
          </DialogDescription>
        </DialogHeader>

        <fetcher.Form method="post" className="flex flex-col gap-4">
          <input
            type="hidden"
            name="intent"
            value={payInscriptionDepositIntent}
          />
          <input
            type="hidden"
            name="inscriptionId"
            value={inscription.inscriptionId ?? ""}
          />

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Precio</span>
            <Select
              name="priceId"
              value={selectedPriceId ?? ""}
              onValueChange={(value) => {
                setSelectedPriceId(value);
                setSelectedPaymentId(null);
              }}
              disabled={isSaving}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Elegí un precio" />
              </SelectTrigger>
              <SelectContent>
                {priceRows.map((price) => (
                  <SelectItem key={price.id} value={price.id}>
                    {price.name} · {formatAmount(price.amount)} · seña{" "}
                    {formatAmount(price.depositAmount)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedPrice !== null ? (
            payableForSelectedPrice.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Pago</span>
                <Select
                  name="paymentId"
                  value={selectedPaymentId ?? ""}
                  onValueChange={setSelectedPaymentId}
                  disabled={isSaving}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Elegí un pago" />
                  </SelectTrigger>
                  <SelectContent>
                    {payableForSelectedPrice.map((payment) => (
                      <SelectItem key={payment.id} value={payment.id}>
                        {formatPaymentNumber(payment.paymentNumber)} ·{" "}
                        {formatDate(payment.paymentDate)} · disponible{" "}
                        {formatAmount(payment.availableAmount)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <Alert variant="warning">
                <AlertTriangle aria-hidden="true" />
                <AlertDescription>
                  No hay pagos con saldo suficiente para el precio elegido.
                </AlertDescription>
              </Alert>
            )
          ) : null}

          {fetcher.data?.status === "error" ? (
            <Alert variant="destructive">
              <AlertTriangle aria-hidden="true" />
              <AlertDescription>{fetcher.data.message}</AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isSaving}>
                Cancelar
              </Button>
            </DialogClose>
            <Button
              type="submit"
              disabled={!selectedPriceId || !selectedPaymentId || isSaving}
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
              Guardar
            </Button>
          </DialogFooter>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  );
}

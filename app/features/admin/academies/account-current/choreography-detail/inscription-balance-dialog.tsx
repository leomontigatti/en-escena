import { AlertTriangle, Check, LoaderCircle, Trash2 } from "lucide-react";
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
import { deleteAllocationIntent, payInscriptionBalanceIntent } from "./shared";

type ChoreographyFinanceDetailLoaderData = Awaited<
  ReturnType<typeof loadAdministrativeChoreographyFinanceDetail>
>;
type InscriptionRow =
  ChoreographyFinanceDetailLoaderData["inscriptions"][number];
type PaymentRow = ChoreographyFinanceDetailLoaderData["payments"][number];

/**
 * Diálogo por fila del cobro extraordinario de saldo de una huérfana `señada` en
 * una coreografía mixta: elegir un pago con disponible suficiente para el saldo
 * de esa inscripción. El saldo mostrado es tentativo (descuento estimado contra
 * el roster vigente); el server recalcula el descuento y congela el snapshot. La
 * `señada` ya tiene su seña asignada, así que el diálogo también ofrece
 * deshacerla y devolver la inscripción a `impaga`.
 */
export function InscriptionBalanceDialog({
  inscription,
  open,
  onOpenChange,
  payments,
}: {
  inscription: InscriptionRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payments: PaymentRow[];
}) {
  const fetcher = useFetcher<{ status: "error"; message: string }>();
  const deleteFetcher = useFetcher<{ status: "error"; message: string }>();
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(
    null,
  );
  const isSaving = fetcher.state !== "idle";
  const isDeleting = deleteFetcher.state !== "idle";
  const isBusy = isSaving || isDeleting;
  const balanceAmount = inscription.balanceAmount ?? 0;
  const payableForBalance = payments.filter(
    (payment) => payment.availableAmount >= balanceAmount,
  );
  const undoableAllocation = inscription.undoableAllocation;
  const formId = `assign-balance-${inscription.inscriptionId ?? "row"}`;

  return (
    <Dialog open={open} onOpenChange={(next) => !isBusy && onOpenChange(next)}>
      <DialogContent overlayClassName="backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle>Asignar saldo</DialogTitle>
          <DialogDescription>
            Elegí el pago para saldar la inscripción.
          </DialogDescription>
        </DialogHeader>

        <fetcher.Form id={formId} method="post" className="flex flex-col gap-4">
          <input
            type="hidden"
            name="intent"
            value={payInscriptionBalanceIntent}
          />
          <input
            type="hidden"
            name="inscriptionId"
            value={inscription.inscriptionId ?? ""}
          />

          <div className="flex flex-col gap-1.5 rounded-md border bg-muted/50 px-3 py-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-muted-foreground">
                Saldo a cobrar
              </span>
              <span className="text-sm font-medium tabular-nums">
                {formatAmount(balanceAmount)}
              </span>
            </div>
          </div>

          {payableForBalance.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Pago</span>
              <Select
                name="paymentId"
                value={selectedPaymentId ?? undefined}
                onValueChange={setSelectedPaymentId}
                disabled={isBusy}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Elegí un pago" />
                </SelectTrigger>
                <SelectContent>
                  {payableForBalance.map((payment) => (
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
                No hay pagos con saldo suficiente para el saldo de la
                inscripción.
              </AlertDescription>
            </Alert>
          )}

          {fetcher.data?.status === "error" ? (
            <Alert variant="destructive">
              <AlertTriangle aria-hidden="true" />
              <AlertDescription>{fetcher.data.message}</AlertDescription>
            </Alert>
          ) : null}
        </fetcher.Form>

        {deleteFetcher.data?.status === "error" ? (
          <Alert variant="destructive">
            <AlertTriangle aria-hidden="true" />
            <AlertDescription>{deleteFetcher.data.message}</AlertDescription>
          </Alert>
        ) : null}

        <DialogFooter className="sm:justify-between">
          {undoableAllocation ? (
            <deleteFetcher.Form method="post">
              <input
                type="hidden"
                name="intent"
                value={deleteAllocationIntent}
              />
              <input
                type="hidden"
                name="allocationId"
                value={undoableAllocation.id}
              />
              <Button type="submit" variant="destructive" disabled={isBusy}>
                {isDeleting ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="animate-spin"
                    data-icon="inline-start"
                  />
                ) : (
                  <Trash2 aria-hidden="true" data-icon="inline-start" />
                )}
                Eliminar
              </Button>
            </deleteFetcher.Form>
          ) : (
            <span />
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isBusy}>
                Cancelar
              </Button>
            </DialogClose>
            <Button
              type="submit"
              form={formId}
              disabled={!selectedPaymentId || isBusy}
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
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

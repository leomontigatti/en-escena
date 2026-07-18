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
import { formatDancerName } from "./inscription-cobro-dialog";
import type { loadAdministrativeChoreographyFinanceDetail } from "./server";
import { payInscriptionBalanceIntent } from "./shared";

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
 * el roster vigente); el server recalcula el descuento y congela el snapshot.
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
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(
    null,
  );
  const isSaving = fetcher.state !== "idle";
  const balanceAmount = inscription.balanceAmount ?? 0;
  const payableForBalance = payments.filter(
    (payment) => payment.availableAmount >= balanceAmount,
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !isSaving && onOpenChange(next)}
    >
      <DialogContent overlayClassName="backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle>Cobrar saldo de la inscripción</DialogTitle>
          <DialogDescription>
            Elegí el pago para saldar a {formatDancerName(inscription)}.
          </DialogDescription>
        </DialogHeader>

        <fetcher.Form method="post" className="flex flex-col gap-4">
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

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Pago a asignar</span>
            <Select
              name="paymentId"
              value={selectedPaymentId ?? undefined}
              onValueChange={setSelectedPaymentId}
              disabled={isSaving}
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
            {payableForBalance.length === 0 ? (
              <span className="text-xs text-muted-foreground">
                No hay pagos con disponible suficiente para este saldo.
              </span>
            ) : null}
          </div>

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
            <Button type="submit" disabled={!selectedPaymentId || isSaving}>
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

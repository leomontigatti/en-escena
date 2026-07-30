/**
 * THROWAWAY PROTOTYPE — Detail, variant C: "two panes, amounts by hand".
 *
 * The manual end of the range: payments and their available balance on the left,
 * the roster with an editable amount column on the right. There is no dialog and
 * no preset preview — the shortcuts write straight onto the table. This is the
 * variant that treats arbitrary allocation as the common path, which is what
 * makes it a contrast with A and B, where it is the exception.
 */
import { Eraser, Scissors, Wallet } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/shared/utils";

import { formatAmount, formatDate } from "../formatters";
import type { AllocationVariantProps } from "./shared";

export function DetailVariantC({
  state,
  inscriptions,
  payments,
  selectedPaymentId,
  onSelectPayment,
  onSelectPrice,
  onAllocate,
}: AllocationVariantProps) {
  const selectedPayment =
    payments.find((payment) => payment.id === selectedPaymentId) ?? null;

  function allocatedFromSelected(inscriptionId: string) {
    if (selectedPayment === null) {
      return 0;
    }

    return (
      state.allocations.find(
        (allocation) =>
          allocation.paymentId === selectedPayment.id &&
          allocation.inscriptionId === inscriptionId,
      )?.amount ?? 0
    );
  }

  const draftTotal = inscriptions.reduce(
    (total, inscription) => total + allocatedFromSelected(inscription.id),
    0,
  );

  function fill(mode: "deposit" | "total" | "even" | "clear") {
    if (selectedPayment === null) {
      return;
    }

    const targets = inscriptions.filter(
      (inscription) => inscription.totalAmount !== null,
    );
    const capacity = selectedPayment.availableAmount + draftTotal;

    if (mode === "clear") {
      for (const inscription of inscriptions) {
        onAllocate(selectedPayment.id, inscription.id, 0);
      }
      return;
    }

    if (mode === "even") {
      const share = Math.floor(capacity / Math.max(1, targets.length));
      for (const inscription of targets) {
        onAllocate(selectedPayment.id, inscription.id, share);
      }
      return;
    }

    let left = capacity;
    for (const inscription of targets) {
      const goal =
        mode === "deposit"
          ? (inscription.depositAmount ?? 0)
          : (inscription.totalAmount ?? 0);
      const alreadyElsewhere =
        inscription.allocatedAmount - allocatedFromSelected(inscription.id);
      const wanted = Math.max(0, Math.min(goal - alreadyElsewhere, left));
      onAllocate(selectedPayment.id, inscription.id, wanted);
      left -= wanted;
    }
  }

  return (
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[20rem_1fr] lg:items-start">
      <aside className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Pagos de la academia
        </h2>
        {payments.map((payment) => {
          const isSelected = payment.id === selectedPaymentId;

          return (
            <Card
              key={payment.id}
              className={cn(
                "cursor-pointer transition-colors hover:bg-accent",
                isSelected && "border-brand ring-2 ring-brand/30",
              )}
              onClick={() => onSelectPayment(payment.id)}
            >
              <CardContent className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium tabular-nums">
                    Pago #{payment.number}
                  </span>
                  <Badge variant="secondary">{payment.method}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatDate(payment.paymentDate)}
                </p>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-lg font-semibold tabular-nums">
                    {formatAmount(payment.availableAmount)}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    de {formatAmount(payment.amount)}
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </aside>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={selectedPayment === null}
            onClick={() => fill("deposit")}
          >
            <Wallet data-icon="inline-start" />
            Completar hasta la seña
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={selectedPayment === null}
            onClick={() => fill("total")}
          >
            Completar el total
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={selectedPayment === null}
            onClick={() => fill("even")}
          >
            <Scissors data-icon="inline-start" />
            Repartir en partes iguales
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={selectedPayment === null}
            onClick={() => fill("clear")}
          >
            <Eraser data-icon="inline-start" />
            Limpiar este pago
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bailarín</TableHead>
              <TableHead>Precio</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Asignado</TableHead>
              <TableHead className="text-right">De este pago</TableHead>
              <TableHead className="text-right">Restante</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {inscriptions.map((inscription) => (
              <TableRow key={inscription.id}>
                <TableCell className="font-medium">
                  <div className="flex flex-col">
                    {inscription.dancerName}
                    <span className="text-xs text-muted-foreground">
                      {inscription.choreographyName}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <Select
                    value={inscription.selectedPriceId ?? ""}
                    onValueChange={(value) =>
                      onSelectPrice(inscription.id, value)
                    }
                  >
                    <SelectTrigger size="sm" className="w-40">
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
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {inscription.totalAmount === null ? (
                    <span className="text-muted-foreground">Sin precio</span>
                  ) : (
                    formatAmount(inscription.totalAmount)
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <span
                    className={cn(
                      inscription.status !== null &&
                        inscription.status !== "depositPending" &&
                        "text-success",
                      inscription.excessAmount > 0 && "text-warning",
                    )}
                  >
                    {formatAmount(inscription.allocatedAmount)}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <Input
                    inputMode="numeric"
                    aria-label={`Monto para ${inscription.dancerName}`}
                    className="ml-auto w-28 text-right tabular-nums"
                    value={allocatedFromSelected(inscription.id) || ""}
                    disabled={selectedPayment === null}
                    onChange={(event) =>
                      onAllocate(
                        selectedPayment?.id ?? "",
                        inscription.id,
                        Number(event.target.value.replace(/\D/g, "") || 0),
                      )
                    }
                  />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {inscription.owedBalanceAmount === null
                    ? "—"
                    : formatAmount(inscription.owedBalanceAmount)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {selectedPayment !== null ? (
          <div className="sticky bottom-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
            <p className="text-sm">
              Asignaste{" "}
              <span className="font-semibold tabular-nums">
                {formatAmount(draftTotal)}
              </span>{" "}
              del pago #{selectedPayment.number}. Queda{" "}
              <span className="font-semibold tabular-nums">
                {formatAmount(selectedPayment.availableAmount)}
              </span>{" "}
              sin asignar.
            </p>
            <Button type="button" disabled>
              Guardar asignaciones
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

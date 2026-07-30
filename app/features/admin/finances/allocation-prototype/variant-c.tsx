/**
 * PROTOTIPO DESCARTABLE — Variante C: "el reparto es el sujeto".
 *
 * La pantalla no se edita: es una lectura compacta con una barra segmentada por
 * pago. Toda asignación pasa por un panel lateral de tres pasos — elegí el pago,
 * elegí una estrategia de reparto, revisá la previsualización fila por fila
 * (antes → después, con el sobrante a la vista) y confirmá. El precio se elige
 * una vez para todo el reparto, con override por fila en la previsualización.
 */
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import type { InscriptionReading } from "./fixtures";
import type { AllocationVariantProps } from "./shared";

type SpreadStrategy = "threshold" | "total" | "even" | "manual";

const strategyLabels: Record<SpreadStrategy, string> = {
  threshold: "Completar la seña de cada una",
  total: "Completar el total, en orden",
  even: "Partes iguales",
  manual: "Sin reparto automático",
};

export function VariantC({
  state,
  inscriptions,
  payments,
  onSelectPrice,
  onAllocate,
}: AllocationVariantProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Cada barra muestra de qué pago viene el dinero de esa inscripción.
        </p>
        <Button type="button" onClick={() => setOpen(true)}>
          Asignar un pago
        </Button>
      </div>

      <ul className="flex flex-col divide-y rounded-xl border">
        {inscriptions.map((inscription) => (
          <li
            key={inscription.id}
            className="flex flex-col gap-2 p-4 md:grid md:grid-cols-[16rem_1fr_12rem] md:items-center md:gap-4"
          >
            <div className="flex flex-col">
              <span className="font-medium">{inscription.dancerName}</span>
              <span className="text-xs text-muted-foreground">
                {inscription.choreographyName} ·{" "}
                {inscription.priceName ?? "sin precio"}
              </span>
            </div>
            <SegmentedBar inscription={inscription} state={state} />
            <div className="flex items-center justify-between gap-2 md:justify-end">
              <span className="text-sm tabular-nums">
                {formatAmount(inscription.allocatedAmount)}
                <span className="text-muted-foreground">
                  {" / "}
                  {inscription.owedAmount === null
                    ? "—"
                    : formatAmount(inscription.owedAmount)}
                </span>
              </span>
              {inscription.settled ? (
                <Badge variant="success">Saldada</Badge>
              ) : inscription.thresholdCrossed ? (
                <Badge variant="info">Seña cubierta</Badge>
              ) : (
                <Badge variant="warning">Bajo la seña</Badge>
              )}
            </div>
          </li>
        ))}
      </ul>

      <SpreadSheet
        open={open}
        onClose={() => setOpen(false)}
        state={state}
        inscriptions={inscriptions}
        payments={payments}
        onSelectPrice={onSelectPrice}
        onAllocate={onAllocate}
      />
    </div>
  );
}

function SegmentedBar({
  inscription,
  state,
}: {
  inscription: InscriptionReading;
  state: AllocationVariantProps["state"];
}) {
  const total = inscription.owedAmount ?? inscription.allocatedAmount;

  if (total === 0) {
    return (
      <p className="text-xs text-muted-foreground">Sin dinero asignado.</p>
    );
  }

  const thresholdPercentage = Math.round(
    ((inscription.thresholdAmount ?? 0) / total) * 100,
  );

  return (
    <div className="relative flex h-3 w-full overflow-hidden rounded-full bg-muted">
      {inscription.allocations.map((allocation, index) => {
        const payment = state.payments.find(
          (row) => row.id === allocation.paymentId,
        );

        return (
          <div
            key={allocation.paymentId}
            title={`Pago #${payment?.number} · ${formatAmount(allocation.amount)}`}
            className={cn(
              "h-full border-r border-background last:border-r-0",
              index % 2 === 0 ? "bg-brand" : "bg-brand/60",
            )}
            style={{
              width: `${Math.min(100, (allocation.amount / total) * 100)}%`,
            }}
          />
        );
      })}
      {inscription.thresholdAmount !== null ? (
        <div
          className="absolute inset-y-0 w-px bg-foreground"
          style={{ left: `${Math.min(100, thresholdPercentage)}%` }}
          aria-hidden
        />
      ) : null}
    </div>
  );
}

type SpreadSheetProps = {
  open: boolean;
  onClose: () => void;
  state: AllocationVariantProps["state"];
  inscriptions: InscriptionReading[];
  payments: AllocationVariantProps["payments"];
  onSelectPrice: AllocationVariantProps["onSelectPrice"];
  onAllocate: AllocationVariantProps["onAllocate"];
};

function SpreadSheet({
  open,
  onClose,
  state,
  inscriptions,
  payments,
  onSelectPrice,
  onAllocate,
}: SpreadSheetProps) {
  const [paymentId, setPaymentId] = useState("");
  const [strategy, setStrategy] = useState<SpreadStrategy>("threshold");
  const [defaultPriceId, setDefaultPriceId] = useState("");

  const payment = payments.find((row) => row.id === paymentId) ?? null;
  const plan = buildPlan({
    inscriptions,
    available: payment?.availableAmount ?? 0,
    strategy,
    prices: state.prices,
    defaultPriceId,
    depositPercentage: state.requiredDepositPercentage,
  });
  const planned = plan.reduce((total, row) => total + row.amount, 0);

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Repartir un pago</SheetTitle>
          <SheetDescription>
            Revisá el reparto antes de confirmarlo. Nada se guarda hasta que
            confirmás.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
          <FieldGroup>
            <Field orientation="responsive">
              <FieldLabel htmlFor="pago-reparto">Pago</FieldLabel>
              <Select value={paymentId} onValueChange={setPaymentId}>
                <SelectTrigger id="pago-reparto" className="w-full">
                  <SelectValue placeholder="Elegí un pago" />
                </SelectTrigger>
                <SelectContent>
                  {payments.map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      Pago #{row.number} · {formatDate(row.paymentDate)} ·
                      disponible {formatAmount(row.availableAmount)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field orientation="responsive">
              <FieldLabel htmlFor="estrategia">Reparto</FieldLabel>
              <Select
                value={strategy}
                onValueChange={(value) => setStrategy(value as SpreadStrategy)}
              >
                <SelectTrigger id="estrategia" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(strategyLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field orientation="responsive">
              <FieldLabel htmlFor="precio-reparto">
                Precio para las que no tienen
              </FieldLabel>
              <Select value={defaultPriceId} onValueChange={setDefaultPriceId}>
                <SelectTrigger id="precio-reparto" className="w-full">
                  <SelectValue placeholder="Elegí un precio" />
                </SelectTrigger>
                <SelectContent>
                  {state.prices.map((price) => (
                    <SelectItem key={price.id} value={price.id}>
                      {price.name} · {formatAmount(price.amount)} · vence{" "}
                      {formatDate(price.paymentDeadline)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bailarín</TableHead>
                <TableHead className="text-right">Ahora</TableHead>
                <TableHead className="text-right">Se le asigna</TableHead>
                <TableHead className="text-right">Queda</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plan.map((row) => (
                <TableRow
                  key={row.inscription.id}
                  className={cn(row.amount === 0 && "text-muted-foreground")}
                >
                  <TableCell>
                    {row.inscription.dancerName}
                    {row.needsPrice ? (
                      <Badge variant="outline" className="ml-2">
                        Precio nuevo
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatAmount(row.inscription.allocatedAmount)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {row.amount === 0 ? "—" : `+ ${formatAmount(row.amount)}`}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatAmount(row.inscription.allocatedAmount + row.amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <SheetFooter>
          <p className="text-sm">
            Se reparten{" "}
            <span className="font-semibold tabular-nums">
              {formatAmount(planned)}
            </span>
            . Sobra{" "}
            <span className="font-semibold tabular-nums">
              {formatAmount((payment?.availableAmount ?? 0) - planned)}
            </span>{" "}
            sin asignar.
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={payment === null || planned === 0}
              onClick={() => {
                for (const row of plan) {
                  if (row.needsPrice && defaultPriceId !== "") {
                    onSelectPrice(row.inscription.id, defaultPriceId);
                  }
                  if (row.amount === 0) {
                    continue;
                  }

                  // `onAllocate` es un upsert de `(pago, inscripción)`: el monto
                  // es absoluto, así que el reparto se suma a lo que ese mismo
                  // pago ya tenía puesto en esta inscripción.
                  const existing =
                    row.inscription.allocations.find(
                      (allocation) => allocation.paymentId === payment?.id,
                    )?.amount ?? 0;
                  onAllocate(
                    payment?.id ?? "",
                    row.inscription.id,
                    existing + row.amount,
                  );
                }
                onClose();
              }}
            >
              Confirmar reparto
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

type PlanRow = {
  inscription: InscriptionReading;
  amount: number;
  needsPrice: boolean;
};

function buildPlan({
  inscriptions,
  available,
  strategy,
  prices,
  defaultPriceId,
  depositPercentage,
}: {
  inscriptions: InscriptionReading[];
  available: number;
  strategy: SpreadStrategy;
  prices: AllocationVariantProps["state"]["prices"];
  defaultPriceId: string;
  depositPercentage: number;
}): PlanRow[] {
  const fallbackPrice = prices.find((price) => price.id === defaultPriceId);

  const rows = inscriptions.map((inscription) => {
    const needsPrice = inscription.owedAmount === null;
    const owed =
      inscription.owedAmount ??
      (fallbackPrice ? fallbackPrice.amount - inscription.discountAmount : 0);

    return { inscription, needsPrice, owed };
  });

  if (strategy === "manual") {
    return rows.map((row) => ({ ...row, amount: 0 }));
  }

  if (strategy === "even") {
    const share = Math.floor(available / Math.max(1, rows.length));
    return rows.map((row) => ({ ...row, amount: share }));
  }

  let left = available;
  return rows.map((row) => {
    const goal =
      strategy === "threshold"
        ? Math.round((row.owed * depositPercentage) / 100)
        : row.owed;
    const amount = Math.max(
      0,
      Math.min(goal - row.inscription.allocatedAmount, left),
    );
    left -= amount;

    return { ...row, amount };
  });
}

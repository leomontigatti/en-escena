/**
 * PROTOTIPO DESCARTABLE — Variante B: "el plantel es el sujeto".
 *
 * Una sola tabla densa, una fila por bailarín, con la lectura de avance como
 * barra de progreso y una marca de umbral de seña. Asignar es una acción de fila
 * (diálogo con precio, pago y monto). El reparto de un pago entre varias
 * inscripciones aparece sólo cuando hay selección: columna de checkbox más barra
 * de acción masiva, que es exactamente lo que #513 quiere devolver.
 */
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/shared/utils";

import { formatAmount } from "../formatters";
import type { InscriptionReading } from "./fixtures";
import type { AllocationVariantProps } from "./shared";

export function VariantB({
  state,
  inscriptions,
  payments,
  onSelectPrice,
  onAllocate,
}: AllocationVariantProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [rowTarget, setRowTarget] = useState<InscriptionReading | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  function toggle(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8">
              <Checkbox
                aria-label="Seleccionar todo"
                checked={selectedIds.length === inscriptions.length}
                onCheckedChange={(checked) =>
                  setSelectedIds(
                    checked === true ? inscriptions.map((row) => row.id) : [],
                  )
                }
              />
            </TableHead>
            <TableHead>Bailarín</TableHead>
            <TableHead>Precio elegido</TableHead>
            <TableHead className="w-64">Avance</TableHead>
            <TableHead className="text-right">Asignado / adeudado</TableHead>
            <TableHead className="w-8" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {inscriptions.map((inscription) => (
            <TableRow key={inscription.id}>
              <TableCell>
                <Checkbox
                  aria-label={`Seleccionar ${inscription.dancerName}`}
                  checked={selectedIds.includes(inscription.id)}
                  onCheckedChange={() => toggle(inscription.id)}
                />
              </TableCell>
              <TableCell className="font-medium">
                <div className="flex flex-col">
                  {inscription.dancerName}
                  <span className="text-xs text-muted-foreground">
                    {inscription.choreographyName}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                {inscription.priceName === null ? (
                  <Badge variant="outline">Sin precio</Badge>
                ) : (
                  <Badge variant="secondary">
                    {inscription.priceName} ·{" "}
                    {formatAmount(inscription.priceAmount ?? 0)}
                  </Badge>
                )}
              </TableCell>
              <TableCell>
                <AllocationBar inscription={inscription} />
              </TableCell>
              <TableCell className="text-right tabular-nums">
                <span className="font-medium">
                  {formatAmount(inscription.allocatedAmount)}
                </span>
                <span className="text-muted-foreground">
                  {" / "}
                  {inscription.owedAmount === null
                    ? "—"
                    : formatAmount(inscription.owedAmount)}
                </span>
                {inscription.excessAmount > 0 ? (
                  <p className="text-xs text-warning">
                    Excedente {formatAmount(inscription.excessAmount)}
                  </p>
                ) : null}
              </TableCell>
              <TableCell>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => setRowTarget(inscription)}
                >
                  Asignar
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {selectedIds.length > 0 ? (
        <div className="sticky bottom-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
          <p className="text-sm">
            {selectedIds.length} inscripciones seleccionadas.
          </p>
          <Button type="button" onClick={() => setBulkOpen(true)}>
            Repartir un pago entre las seleccionadas
          </Button>
        </div>
      ) : null}

      <AllocateDialog
        inscription={rowTarget}
        state={state}
        payments={payments}
        onClose={() => setRowTarget(null)}
        onSelectPrice={onSelectPrice}
        onAllocate={onAllocate}
      />

      <BulkDialog
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        payments={payments}
        targets={inscriptions.filter((row) => selectedIds.includes(row.id))}
        onAllocate={onAllocate}
      />
    </div>
  );
}

function AllocationBar({ inscription }: { inscription: InscriptionReading }) {
  if (inscription.owedAmount === null) {
    return (
      <p className="text-xs text-muted-foreground">
        Elegí un precio para leer el avance.
      </p>
    );
  }

  const percentage = Math.min(
    100,
    Math.round((inscription.allocatedAmount / inscription.owedAmount) * 100),
  );
  const thresholdPercentage = Math.round(
    ((inscription.thresholdAmount ?? 0) / inscription.owedAmount) * 100,
  );

  return (
    <div className="flex flex-col gap-1">
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            inscription.settled
              ? "bg-success"
              : inscription.thresholdCrossed
                ? "bg-brand"
                : "bg-warning",
          )}
          style={{ width: `${percentage}%` }}
        />
        <div
          className="absolute inset-y-0 w-px bg-foreground"
          style={{ left: `${thresholdPercentage}%` }}
          aria-hidden
        />
      </div>
      <p className="text-xs text-muted-foreground tabular-nums">
        {inscription.settled
          ? "Saldada"
          : inscription.thresholdCrossed
            ? `Seña cubierta · faltan ${formatAmount(inscription.remainingAmount ?? 0)}`
            : `Faltan ${formatAmount((inscription.thresholdAmount ?? 0) - inscription.allocatedAmount)} para la seña`}
      </p>
    </div>
  );
}

type AllocateDialogProps = {
  inscription: InscriptionReading | null;
  state: AllocationVariantProps["state"];
  payments: AllocationVariantProps["payments"];
  onClose: () => void;
  onSelectPrice: AllocationVariantProps["onSelectPrice"];
  onAllocate: AllocationVariantProps["onAllocate"];
};

function AllocateDialog({
  inscription,
  state,
  payments,
  onClose,
  onSelectPrice,
  onAllocate,
}: AllocateDialogProps) {
  const [paymentId, setPaymentId] = useState("");
  const [amount, setAmount] = useState("");

  if (inscription === null) {
    return null;
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Asignar a {inscription.dancerName}</DialogTitle>
          <DialogDescription>
            Elegí el precio, el pago y cuánto de ese pago va a esta inscripción.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="precio">Precio</FieldLabel>
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
            <FieldLabel htmlFor="pago">Pago a asignar</FieldLabel>
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

type BulkDialogProps = {
  open: boolean;
  onClose: () => void;
  payments: AllocationVariantProps["payments"];
  targets: InscriptionReading[];
  onAllocate: AllocationVariantProps["onAllocate"];
};

function BulkDialog({
  open,
  onClose,
  payments,
  targets,
  onAllocate,
}: BulkDialogProps) {
  const [paymentId, setPaymentId] = useState("");
  const payment = payments.find((row) => row.id === paymentId) ?? null;
  const share =
    payment === null
      ? 0
      : Math.floor(payment.availableAmount / Math.max(1, targets.length));

  if (!open) {
    return null;
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Repartir un pago</DialogTitle>
          <DialogDescription>
            El monto disponible se divide en partes iguales entre las{" "}
            {targets.length} inscripciones seleccionadas.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="pago-masivo">Pago a asignar</FieldLabel>
            <Select value={paymentId} onValueChange={setPaymentId}>
              <SelectTrigger id="pago-masivo" className="w-full">
                <SelectValue placeholder="Elegí un pago" />
              </SelectTrigger>
              <SelectContent>
                {payments.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    Pago #{row.number} · disponible{" "}
                    {formatAmount(row.availableAmount)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </FieldGroup>
        {payment !== null ? (
          <p className="text-sm text-muted-foreground">
            Le toca {formatAmount(share)} a cada una.
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={payment === null}
            onClick={() => {
              for (const target of targets) {
                onAllocate(payment?.id ?? "", target.id, share);
              }
              onClose();
            }}
          >
            Repartir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

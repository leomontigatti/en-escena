/**
 * PROTOTIPO DESCARTABLE — ticket #550 del mapa #547.
 *
 * El diálogo del preset, compartido por las dos vistas. Muestra el plan *antes*
 * de aplicarlo porque las tres decisiones abiertas se ven acá: de dónde sale la
 * plata, qué pasa con las filas sin precio, y qué pasa cuando no alcanza.
 */
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";

import { formatAmount } from "../formatters";
import type { InscriptionReading, PaymentReading } from "./fixtures";
import {
  buildPresetPlan,
  planUpserts,
  presetLabels,
  skipReasonLabels,
  type PresetKind,
  type ShortfallPolicy,
} from "./presets";

export type PresetDialogProps = {
  kind: PresetKind;
  targets: InscriptionReading[];
  payments: PaymentReading[];
  open: boolean;
  onClose: () => void;
  onApply: (
    upserts: { paymentId: string; inscriptionId: string; amount: number }[],
  ) => void;
};

export function PresetDialog({
  kind,
  targets,
  payments,
  open,
  onClose,
  onApply,
}: PresetDialogProps) {
  const [sourceId, setSourceId] = useState<string>("all");
  const [shortfallPolicy, setShortfallPolicy] =
    useState<ShortfallPolicy>("fillInOrder");

  if (!open) {
    return null;
  }

  const sources =
    sourceId === "all"
      ? payments
      : payments.filter((payment) => payment.id === sourceId);
  const plan = buildPresetPlan({
    inscriptions: targets,
    payments: sources,
    kind,
    shortfallPolicy,
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{presetLabels[kind]}</DialogTitle>
          <DialogDescription>
            {targets.length} inscripciones elegidas. El preset lee la figura de
            cada una; no elige precios ni reparte de más.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-4">
            <ChoiceRow
              label="Plata"
              options={[
                { value: "all", label: "Todo el saldo disponible" },
                ...payments.map((payment) => ({
                  value: payment.id,
                  label: `Pago #${payment.number} · ${formatAmount(payment.availableAmount)}`,
                })),
              ]}
              value={sourceId}
              onChange={setSourceId}
            />
            <ChoiceRow
              label="Si no alcanza"
              options={[
                { value: "fillInOrder", label: "Cubrir las que entren" },
                { value: "allOrNothing", label: "Todo o nada" },
              ]}
              value={shortfallPolicy}
              onChange={(value) => setShortfallPolicy(value as ShortfallPolicy)}
            />
          </div>

          {plan.blockedByShortfall ? (
            <Alert variant="warning">
              <AlertDescription>
                Faltan {formatAmount(plan.shortfallAmount)} para cubrir las{" "}
                {plan.lines.length} inscripciones completas. Con «todo o nada»
                no se asigna nada.
              </AlertDescription>
            </Alert>
          ) : null}

          {plan.skipped.length > 0 ? (
            <Alert>
              <AlertDescription>
                Quedan afuera {plan.skipped.length}:{" "}
                {plan.skipped
                  .map(
                    (row) =>
                      `${row.inscription.dancerName} (${skipReasonLabels[row.reason]})`,
                  )
                  .join(", ")}
                .
              </AlertDescription>
            </Alert>
          ) : null}

          {plan.lines.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bailarín</TableHead>
                  <TableHead className="text-right">Pide</TableHead>
                  <TableHead className="text-right">Se le asigna</TableHead>
                  <TableHead>De qué pago</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plan.lines.map((line) => (
                  <TableRow key={line.inscription.id}>
                    <TableCell className="font-medium">
                      {line.inscription.dancerName}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatAmount(line.targetAmount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatAmount(line.amount)}
                      {line.amount < line.targetAmount ? (
                        <Badge variant="warning" className="ml-2">
                          parcial
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {line.fundedBy.length === 0
                        ? "—"
                        : line.fundedBy
                            .map(
                              (source) =>
                                `#${source.paymentNumber}: ${formatAmount(source.amount)}`,
                            )
                            .join(" · ")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">
              Ninguna de las filas elegidas necesita este preset.
            </p>
          )}

          <p className="text-sm tabular-nums">
            Pide {formatAmount(plan.requestedAmount)} · asigna{" "}
            {formatAmount(plan.fundedAmount)} · sobra{" "}
            {formatAmount(plan.leftoverAmount)}
            {plan.shortfallAmount > 0
              ? ` · falta ${formatAmount(plan.shortfallAmount)}`
              : ""}
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={plan.fundedAmount === 0}
            onClick={() => {
              onApply(planUpserts(plan));
              onClose();
            }}
          >
            Asignar {formatAmount(plan.fundedAmount)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChoiceRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <Button
            key={option.value}
            type="button"
            size="xs"
            variant={option.value === value ? "default" : "outline"}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

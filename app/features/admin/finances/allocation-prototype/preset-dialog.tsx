/**
 * THROWAWAY PROTOTYPE — ticket #550 of map #547.
 *
 * The preset dialog, shared by both views. It shows the plan *before* applying
 * it, because a preset writes several allocations at once and the admin should
 * see which rows it reaches and which it leaves out.
 *
 * There is **no money chooser**: the preset draws from the academy's
 * `Saldo disponible`, and which payments fund it is the fill rule's business.
 * The «De qué pago» column stays, as a readout of what the rule decided.
 */
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
  if (!open) {
    return null;
  }

  const plan = buildPresetPlan({
    inscriptions: targets,
    payments,
    kind,
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{presetLabels[kind]}</DialogTitle>
          <DialogDescription>
            {targets.length} inscripciones elegidas. Sale del saldo disponible
            de la academia; el preset lee la figura de cada una y no elige
            precios. Si la plata no alcanza, cubre las que entren y deja las
            demás parciales.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {plan.shortfallAmount > 0 ? (
            <Alert variant="warning">
              <AlertDescription>
                Faltan {formatAmount(plan.shortfallAmount)} para cubrir las{" "}
                {plan.lines.length} inscripciones completas. Se cubren las que
                entren, en orden; las demás quedan parciales.
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

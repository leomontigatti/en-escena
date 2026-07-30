/**
 * THROWAWAY PROTOTYPE — Detail, variant A: "presets first".
 *
 * The inscriptions table with selection, and the two presets as the only visible
 * action. Allocating an amount by hand exists, but it is tucked into the row's
 * menu: it is the exception, not the path. The price is chosen in the same place
 * the money is allocated, because a row with no price cannot enter a preset.
 */
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { formatAmount } from "../formatters";
import {
  inscriptionStatusBadgeVariants,
  inscriptionStatusLabels,
  type InscriptionReading,
} from "./fixtures";
import { ManualAllocateDialog } from "./manual-allocate-dialog";
import { PresetDialog } from "./preset-dialog";
import { presetLabels, presetTargetAmount, type PresetKind } from "./presets";
import type { AllocationVariantProps } from "./shared";

export function DetailVariantA({
  state,
  inscriptions,
  payments,
  onSelectPrice,
  onAllocate,
  onApplyUpserts,
}: AllocationVariantProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [preset, setPreset] = useState<PresetKind | null>(null);
  const [manualTarget, setManualTarget] = useState<InscriptionReading | null>(
    null,
  );

  const selected = inscriptions.filter((row) => selectedIds.includes(row.id));
  const pendingPrice = selected.filter((row) => row.status === null);

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
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Seña</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="text-right">Asignado</TableHead>
            <TableHead className="text-right">Adeudado</TableHead>
            <TableHead className="w-8" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {inscriptions.map((row) => (
            <TableRow key={row.id}>
              <TableCell>
                <Checkbox
                  aria-label={`Seleccionar ${row.dancerName}`}
                  checked={selectedIds.includes(row.id)}
                  onCheckedChange={() =>
                    setSelectedIds((current) =>
                      current.includes(row.id)
                        ? current.filter((value) => value !== row.id)
                        : [...current, row.id],
                    )
                  }
                />
              </TableCell>
              <TableCell className="font-medium">
                <div className="flex flex-col">
                  {row.dancerName}
                  <span className="text-xs text-muted-foreground">
                    {row.priceName ?? "Sin precio elegido"}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                {row.status === null ? (
                  <Badge variant="outline">Tentativa</Badge>
                ) : (
                  <Badge variant={inscriptionStatusBadgeVariants[row.status]}>
                    {inscriptionStatusLabels[row.status]}
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {row.depositAmount === null
                  ? "—"
                  : formatAmount(row.depositAmount)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {row.totalAmount === null ? "—" : formatAmount(row.totalAmount)}
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {formatAmount(row.allocatedAmount)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {row.owedBalanceAmount === null
                  ? "—"
                  : formatAmount(row.owedBalanceAmount)}
                {row.excessAmount > 0 ? (
                  <p className="text-xs text-warning">
                    +{formatAmount(row.excessAmount)} de más
                  </p>
                ) : null}
              </TableCell>
              <TableCell>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => setManualTarget(row)}
                >
                  A mano
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {selected.length > 0 ? (
        <div className="sticky bottom-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
          <div className="flex flex-col gap-1">
            <p className="text-sm">{selected.length} inscripciones elegidas.</p>
            {pendingPrice.length > 0 ? (
              <p className="text-xs text-warning">
                {pendingPrice.length} sin precio elegido: los presets las van a
                dejar afuera.
              </p>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPreset("deposit")}
            >
              {presetLabels.deposit} ·{" "}
              {formatAmount(sumTargets(selected, "deposit"))}
            </Button>
            <Button type="button" onClick={() => setPreset("balance")}>
              {presetLabels.balance} ·{" "}
              {formatAmount(sumTargets(selected, "balance"))}
            </Button>
          </div>
        </div>
      ) : null}

      {preset !== null ? (
        <PresetDialog
          kind={preset}
          targets={selected}
          payments={payments}
          open
          onClose={() => setPreset(null)}
          onApply={onApplyUpserts}
        />
      ) : null}

      <ManualAllocateDialog
        inscription={manualTarget}
        state={state}
        payments={payments}
        onClose={() => setManualTarget(null)}
        onSelectPrice={onSelectPrice}
        onAllocate={onAllocate}
      />
    </div>
  );
}

function sumTargets(rows: InscriptionReading[], kind: PresetKind) {
  return rows.reduce((total, row) => total + presetTargetAmount(row, kind), 0);
}

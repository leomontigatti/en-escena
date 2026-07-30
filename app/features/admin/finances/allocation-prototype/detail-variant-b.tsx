/**
 * THROWAWAY PROTOTYPE — Detail, variant B: "progress as a bar".
 *
 * The same action as variant A — both presets over the selected rows — but owed
 * against allocated is read graphically: one bar per row with a mark at the
 * deposit threshold. The bet is that a roster with uneven progress reads at a
 * glance, without comparing numbers column by column.
 *
 * Note from #551: nothing here is labelled "umbral de seña". The mark is the
 * border between `Seña pendiente` and `Señada`, and those badges already name it.
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
import { cn } from "@/lib/shared/utils";

import { formatAmount } from "../formatters";
import type { InscriptionReading } from "./fixtures";
import { ManualAllocateDialog } from "./manual-allocate-dialog";
import { PresetDialog } from "./preset-dialog";
import { presetLabels, type PresetKind } from "./presets";
import type { AllocationVariantProps } from "./shared";

export function DetailVariantB({
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
            <TableHead className="w-72">Avance</TableHead>
            <TableHead className="text-right">Asignado / total</TableHead>
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
              <TableCell className="font-medium">{row.dancerName}</TableCell>
              <TableCell>
                {row.priceName === null ? (
                  <Badge variant="outline">Sin precio</Badge>
                ) : (
                  <Badge variant="secondary">{row.priceName}</Badge>
                )}
              </TableCell>
              <TableCell>
                <AllocationBar inscription={row} />
              </TableCell>
              <TableCell className="text-right tabular-nums">
                <span className="font-medium">
                  {formatAmount(row.allocatedAmount)}
                </span>
                <span className="text-muted-foreground">
                  {" / "}
                  {row.totalAmount === null
                    ? "—"
                    : formatAmount(row.totalAmount)}
                </span>
                {row.excessAmount > 0 ? (
                  <p className="text-xs text-warning">
                    Excedente {formatAmount(row.excessAmount)}
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
          <p className="text-sm">{selected.length} inscripciones elegidas.</p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPreset("deposit")}
            >
              {presetLabels.deposit}
            </Button>
            <Button type="button" onClick={() => setPreset("balance")}>
              {presetLabels.balance}
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

function AllocationBar({ inscription }: { inscription: InscriptionReading }) {
  if (inscription.totalAmount === null || inscription.depositAmount === null) {
    return (
      <p className="text-xs text-muted-foreground">
        Elegí un precio para leer el avance.
      </p>
    );
  }

  const percentage = Math.min(
    100,
    Math.round((inscription.allocatedAmount / inscription.totalAmount) * 100),
  );
  // The mark sits against the total because the threshold is computed without
  // the discount: on a discounted row it deliberately lands further right than
  // one might expect.
  const depositPercentage = Math.min(
    100,
    Math.round((inscription.depositAmount / inscription.totalAmount) * 100),
  );

  return (
    <div className="flex flex-col gap-1">
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            inscription.status === "paidInFull"
              ? "bg-success"
              : inscription.status === "depositMet"
                ? "bg-info"
                : "bg-warning",
          )}
          style={{ width: `${percentage}%` }}
        />
        <div
          className="absolute inset-y-0 w-px bg-foreground"
          style={{ left: `${depositPercentage}%` }}
          aria-hidden
        />
      </div>
      <p className="text-xs text-muted-foreground tabular-nums">
        {inscription.status === "paidInFull"
          ? "Pagada"
          : inscription.status === "depositMet"
            ? `Señada · falta ${formatAmount(inscription.owedBalanceAmount ?? 0)}`
            : `Faltan ${formatAmount(inscription.owedDepositAmount ?? 0)} para la seña`}
      </p>
    </div>
  );
}

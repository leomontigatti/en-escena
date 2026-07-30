/**
 * PROTOTIPO DESCARTABLE — Lista, variante A: "la tabla de hoy, más selección".
 *
 * La menor distancia respecto de `academy-choreographies/view.tsx`: las mismas
 * columnas de figuras, el estado como badge, y una columna de checkbox que
 * habilita los dos presets sobre las coreografías elegidas. El preset baja a
 * todas las inscripciones de esas coreografías.
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
import { inscriptionStatusLabels } from "./fixtures";
import { PresetDialog } from "./preset-dialog";
import type { PresetKind } from "./presets";
import { presetLabels } from "./presets";
import { ChoreographyAnomalyBadges } from "./list-shared";
import type { AllocationListVariantProps } from "./shared";

export function ListVariantA({
  choreographies,
  payments,
  onApplyUpserts,
}: AllocationListVariantProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [preset, setPreset] = useState<PresetKind | null>(null);

  const selected = choreographies.filter((row) => selectedIds.includes(row.id));
  const targets = selected.flatMap((row) => row.inscriptions);

  return (
    <div className="flex flex-col gap-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8">
              <Checkbox
                aria-label="Seleccionar todo"
                checked={selectedIds.length === choreographies.length}
                onCheckedChange={(checked) =>
                  setSelectedIds(
                    checked === true ? choreographies.map((row) => row.id) : [],
                  )
                }
              />
            </TableHead>
            <TableHead>Nombre</TableHead>
            <TableHead>Tipo de grupo</TableHead>
            <TableHead className="text-right">Seña</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="text-right">Adeudado</TableHead>
            <TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {choreographies.map((row) => (
            <TableRow key={row.id}>
              <TableCell>
                <Checkbox
                  aria-label={`Seleccionar ${row.name}`}
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
                <div className="flex flex-col gap-1">
                  {row.name}
                  <ChoreographyAnomalyBadges anomalies={row.anomalies} />
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="secondary">{row.groupType}</Badge>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatAmount(row.depositAmount)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatAmount(row.totalAmount)}
                {row.tentative ? " *" : ""}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatAmount(row.owedBalanceAmount)}
              </TableCell>
              <TableCell>
                {row.status === null ? (
                  <Badge variant="outline">Tentativa</Badge>
                ) : (
                  <Badge variant="secondary">
                    {inscriptionStatusLabels[row.status]}
                  </Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <p className="text-xs text-muted-foreground">
        * Figura tentativa: la coreografía tiene inscripciones sin precio
        elegido.
      </p>

      {selected.length > 0 ? (
        <div className="sticky bottom-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
          <p className="text-sm">
            {selected.length} coreografías · {targets.length} inscripciones.
          </p>
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
          targets={targets}
          payments={payments}
          open
          onClose={() => setPreset(null)}
          onApply={onApplyUpserts}
        />
      ) : null}
    </div>
  );
}

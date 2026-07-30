/**
 * PROTOTIPO DESCARTABLE — Lista, variante B: "worklist, sin selección".
 *
 * No hay checkboxes. Las coreografías se agrupan por lo que les falta y cada
 * grupo tiene una sola acción, que es la que corresponde a ese grupo. La apuesta:
 * si el preset es el camino común, elegir filas a mano es trabajo que la vista
 * puede hacer sola, y el admin sólo confirma.
 */
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import { formatAmount } from "../formatters";
import { ChoreographyAnomalyBadges } from "./list-shared";
import { PresetDialog } from "./preset-dialog";
import { presetLabels, type PresetKind } from "./presets";
import type { ChoreographyReading } from "./rollup";
import type { AllocationListVariantProps } from "./shared";

export function ListVariantB({
  choreographies,
  payments,
  onApplyUpserts,
}: AllocationListVariantProps) {
  const [preset, setPreset] = useState<PresetKind | null>(null);

  const groups = [
    {
      kind: "deposit" as const,
      title: "Les falta la seña",
      description:
        "Alguna inscripción todavía no llega al umbral, así que la coreografía no es competable.",
      rows: choreographies.filter((row) => row.owedDepositAmount > 0),
    },
    {
      kind: "balance" as const,
      title: "Señadas, les falta el saldo",
      description: "Ya cruzaron el umbral; queda el resto del total.",
      rows: choreographies.filter(
        (row) => row.owedDepositAmount === 0 && row.owedBalanceAmount > 0,
      ),
    },
    {
      kind: null,
      title: "Al día",
      description: "Nada que asignar.",
      rows: choreographies.filter(
        (row) => row.owedDepositAmount === 0 && row.owedBalanceAmount === 0,
      ),
    },
  ];

  const targets =
    preset === null
      ? []
      : (groups.find((group) => group.kind === preset)?.rows ?? []).flatMap(
          (row) => row.inscriptions,
        );

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <Card key={group.title}>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-semibold">
                  {group.title} ({group.rows.length})
                </h3>
                <p className="text-xs text-muted-foreground">
                  {group.description}
                </p>
              </div>
              {group.kind !== null && group.rows.length > 0 ? (
                <Button type="button" onClick={() => setPreset(group.kind)}>
                  {presetLabels[group.kind]} a las {group.rows.length}
                </Button>
              ) : null}
            </div>
            {group.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ninguna.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {group.rows.map((row) => (
                  <ChoreographyLine key={row.id} row={row} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ))}

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

function ChoreographyLine({ row }: { row: ChoreographyReading }) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-2 last:border-b-0 last:pb-0">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">
          {row.name}{" "}
          <span className="text-xs text-muted-foreground">
            · {row.inscriptions.length} inscripciones
          </span>
        </span>
        <ChoreographyAnomalyBadges anomalies={row.anomalies} />
      </div>
      <span className="text-sm text-muted-foreground tabular-nums">
        {row.owedDepositAmount > 0
          ? `Falta ${formatAmount(row.owedDepositAmount)} de seña`
          : `Falta ${formatAmount(row.owedBalanceAmount)} de saldo`}
      </span>
    </li>
  );
}

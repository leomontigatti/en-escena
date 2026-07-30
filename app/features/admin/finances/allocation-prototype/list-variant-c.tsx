/**
 * PROTOTIPO DESCARTABLE — Lista, variante C: "primero la plata".
 *
 * El sujeto es el pago que entró: se elige uno, y la lista se reordena para
 * mostrar qué podría saldar con esa plata y qué quedaría afuera. Es la lectura
 * del admin que acaba de recibir una transferencia y quiere saber hasta dónde
 * llega, en lugar de partir de las coreografías.
 */
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/shared/utils";

import { formatAmount, formatDate } from "../formatters";
import { ChoreographyAnomalyBadges } from "./list-shared";
import { PresetDialog } from "./preset-dialog";
import { presetLabels, type PresetKind } from "./presets";
import type { AllocationListVariantProps } from "./shared";

export function ListVariantC({
  choreographies,
  payments,
  onApplyUpserts,
}: AllocationListVariantProps) {
  const [paymentId, setPaymentId] = useState(payments[0]?.id ?? "");
  const [preset, setPreset] = useState<PresetKind | null>(null);

  const payment = payments.find((row) => row.id === paymentId) ?? null;
  const available = payment?.availableAmount ?? 0;

  // Alcance acumulado en orden determinista por nombre: cuánto de la lista cubre
  // esta plata si se aplica el preset de seña de arriba hacia abajo.
  let running = available;
  const reach = [...choreographies]
    .sort((left, right) => left.name.localeCompare(right.name, "es-AR"))
    .map((row) => {
      const covered = Math.min(running, row.owedDepositAmount);
      running -= covered;
      return { row, covered, fullyCovered: covered === row.owedDepositAmount };
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        {payments.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => setPaymentId(row.id)}
            className={cn(
              "flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors",
              row.id === paymentId
                ? "border-brand bg-brand/5"
                : "hover:bg-muted/50",
            )}
          >
            <span className="text-sm font-medium">Pago #{row.number}</span>
            <span className="text-xs text-muted-foreground">
              {formatDate(row.paymentDate)} · {row.method}
            </span>
            <span className="text-sm tabular-nums">
              {formatAmount(row.availableAmount)} disponible
            </span>
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">
              Hasta dónde llega {formatAmount(available)}
            </h3>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={payment === null}
                onClick={() => setPreset("deposit")}
              >
                {presetLabels.deposit}
              </Button>
              <Button
                type="button"
                disabled={payment === null}
                onClick={() => setPreset("balance")}
              >
                {presetLabels.balance}
              </Button>
            </div>
          </div>

          <ul className="flex flex-col gap-2">
            {reach.map(({ row, covered, fullyCovered }) => (
              <li
                key={row.id}
                className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-2 last:border-b-0 last:pb-0"
              >
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium">{row.name}</span>
                  <ChoreographyAnomalyBadges anomalies={row.anomalies} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground tabular-nums">
                    Falta {formatAmount(row.owedDepositAmount)} de seña
                  </span>
                  {row.owedDepositAmount === 0 ? (
                    <Badge variant="success">Señada</Badge>
                  ) : fullyCovered ? (
                    <Badge variant="info">Alcanza</Badge>
                  ) : covered > 0 ? (
                    <Badge variant="warning">
                      Alcanza {formatAmount(covered)}
                    </Badge>
                  ) : (
                    <Badge variant="outline">No alcanza</Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {preset !== null && payment !== null ? (
        <PresetDialog
          kind={preset}
          targets={choreographies.flatMap((row) => row.inscriptions)}
          payments={[payment]}
          open
          onClose={() => setPreset(null)}
          onApply={onApplyUpserts}
        />
      ) : null}
    </div>
  );
}

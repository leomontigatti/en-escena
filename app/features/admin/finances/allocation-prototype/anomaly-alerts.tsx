/**
 * THROWAWAY PROTOTYPE — #551's anomalies as **alerts**, not badges.
 *
 * Settled on reacting to the prototype: an over-allocated inscription or a price
 * of the wrong group type is not a state to label, it is a **must-fix problem**.
 * A badge in a cell says "this is how this row is"; an alert says "somebody has
 * to do something". Both anomalies are derived and self-clearing (#551), so
 * there is nothing to acknowledge and nothing to dismiss — the alert disappears
 * when the problem does.
 *
 * The content has to carry the whole weight, since there is no persisted
 * acknowledgement to fall back on (ADR-0009), so each alert names the
 * inscriptions involved and says what the fix is.
 */
import { TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { formatAmount } from "../formatters";
import type { InscriptionReading } from "./fixtures";
import { choreographyAnomalyLabels, readAnomalyTargets } from "./rollup";

export function ChoreographyAnomalyAlerts({
  groupType,
  inscriptions,
}: {
  groupType: string;
  inscriptions: InscriptionReading[];
}) {
  const targets = readAnomalyTargets(groupType, inscriptions);

  return (
    <div className="flex flex-col gap-3">
      {targets.groupTypeMismatch.length > 0 ? (
        <Alert variant="warning">
          <TriangleAlert />
          <AlertTitle>{choreographyAnomalyLabels.groupTypeMismatch}</AlertTitle>
          <AlertDescription>
            <p>
              Esta coreografía es {groupType}, pero{" "}
              {names(targets.groupTypeMismatch)} tiene
              {targets.groupTypeMismatch.length > 1 ? "n" : ""} un precio de
              otro tipo de grupo:{" "}
              {list(
                targets.groupTypeMismatch.map(
                  (row) => `${row.dancerName} → ${row.priceName}`,
                ),
              )}
              .
            </p>
            {/*
              The fix collides with the price lock: a row that already has money
              cannot be re-priced. Saying so is the point — the alert is useless
              if it demands something the surface refuses.
            */}
            <p>
              {targets.groupTypeMismatch.every(
                (row) => row.allocatedAmount === 0,
              )
                ? "Se corrige eligiendo un precio del tipo correcto al asignar."
                : "Las que ya tienen plata asignada no se pueden repreciar: hay que sacarles la plata para que el precio se libere."}
            </p>
          </AlertDescription>
        </Alert>
      ) : null}

      {targets.overAllocated.length > 0 ? (
        <Alert variant="warning">
          <TriangleAlert />
          <AlertTitle>{choreographyAnomalyLabels.overAllocated}</AlertTitle>
          <AlertDescription>
            <p>
              {list(
                targets.overAllocated.map(
                  (row) =>
                    `${row.dancerName} tiene ${formatAmount(row.excessAmount)} de más`,
                ),
              )}
              .
            </p>
            <p>
              No se pudo haber asignado de más a propósito: pasa cuando mejora
              un descuento después de que la plata ya estaba puesta. Hay que
              liberar el excedente para que vuelva al saldo disponible.
            </p>
          </AlertDescription>
        </Alert>
      ) : null}

      {targets.orphanedAllocations.length > 0 ? (
        <Alert variant="warning">
          <TriangleAlert />
          <AlertTitle>
            {choreographyAnomalyLabels.orphanedAllocations}
          </AlertTitle>
          <AlertDescription>
            {names(targets.orphanedAllocations)} tiene
            {targets.orphanedAllocations.length > 1 ? "n" : ""} plata asignada
            sin precio elegido, así que no hay contra qué medirla.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

function names(rows: InscriptionReading[]) {
  return list(rows.map((row) => row.dancerName));
}

function list(values: string[]) {
  if (values.length <= 1) {
    return values.join("");
  }

  return `${values.slice(0, -1).join(", ")} y ${values[values.length - 1]}`;
}

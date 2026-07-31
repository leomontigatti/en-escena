/**
 * THROWAWAY PROTOTYPE — #551's anomalies as **alerts**, not badges.
 *
 * Settled on reacting to the prototype: an over-allocated inscription or a price
 * of the wrong group type is not a state to label, it is a **must-fix problem**.
 * A badge in a cell says "this is how this row is"; an alert says "somebody has
 * to do something". Both are derived and self-clearing (#551), so there is
 * nothing to acknowledge and nothing to dismiss — the alert goes when the
 * problem does.
 *
 * The copy is **generic on purpose**: it names the problem and how many rows it
 * touches, not which ones. An alert that enumerates dancers turns into a second,
 * worse copy of the table right above the real one, and it grows without bound
 * on a big roster. The table underneath is where you find the rows.
 */
import { TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

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
            {count(
              targets.groupTypeMismatch.length,
              "inscripción tiene",
              "inscripciones tienen",
            )}{" "}
            un precio que no es de {groupType}. Se corrige inscripción por
            inscripción, cambiando el precio al asignar; las que ya tienen plata
            asignada hay que vaciarlas primero para que el precio se libere.
          </AlertDescription>
        </Alert>
      ) : null}

      {targets.overAllocated.length > 0 ? (
        <Alert variant="warning">
          <TriangleAlert />
          <AlertTitle>{choreographyAnomalyLabels.overAllocated}</AlertTitle>
          <AlertDescription>
            {count(
              targets.overAllocated.length,
              "inscripción tiene",
              "inscripciones tienen",
            )}{" "}
            más plata asignada de la que deben. No se pudo haber hecho a
            propósito: pasa cuando mejora un descuento después de que la plata
            ya estaba puesta. Hay que liberar el excedente para que vuelva al
            saldo disponible.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

function count(total: number, singular: string, plural: string) {
  return `${total} ${total === 1 ? singular : plural}`;
}

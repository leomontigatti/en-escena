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
 * The copy is **generic and title-less**: it states the problem and points at
 * the list, without counting or naming rows. An alert that enumerates dancers
 * becomes a worse copy of the table right above the real one, and grows without
 * bound on a big roster. The table underneath is where the rows are.
 */
import { TriangleAlert } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";

import type { InscriptionReading } from "./fixtures";
import { readAnomalyTargets } from "./rollup";

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
          <AlertDescription>
            Existen inscripciones con un precio diferente al tipo de grupo de la
            coreografía. Podés corregirlo desde la lista.
          </AlertDescription>
        </Alert>
      ) : null}

      {targets.overAllocated.length > 0 ? (
        <Alert variant="warning">
          <TriangleAlert />
          <AlertDescription>
            Existen inscripciones con dinero sobreasignado. Podés corregirlo
            desde la lista.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

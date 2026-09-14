// PROTOTYPE — throwaway, lives only on branch `prototype/912-participation-list`
// (wayfinder ticket #912, map #907). The notices above the list, and the prototype's state card.
import { AlertTriangle, Info, SquareArrowOutUpRight } from "lucide-react";

import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import type { PrototypeCaseId } from "./participation-fixtures.prototype";

/**
 * Each notice takes the variant of what it says: `info` for a state that hides
 * the drag handles until the next ordering, `warning` for the rows that carry
 * an `Advertencia`.
 */
export function ListNotices({
  canEditOrder,
  flaggedCount,
  hasPresentations,
  isSortedByOrder,
  onlyWarnings,
  onToggleOnlyWarnings,
  unorderedCount,
}: {
  canEditOrder: boolean;
  flaggedCount: number;
  hasPresentations: boolean;
  isSortedByOrder: boolean;
  onlyWarnings: boolean;
  onToggleOnlyWarnings: () => void;
  unorderedCount: number;
}) {
  return (
    <div className="flex flex-col gap-3">
      {hasPresentations && unorderedCount > 0 ? (
        <Alert variant="info">
          <Info aria-hidden="true" />
          <AlertDescription>
            {unorderedCount === 1
              ? "Existe 1 coreografía sin número de presentación."
              : `Existen ${unorderedCount} coreografías sin número de presentación.`}
          </AlertDescription>
        </Alert>
      ) : null}

      {flaggedCount > 0 ? (
        <Alert variant="warning">
          <AlertTriangle aria-hidden="true" />
          <AlertDescription>
            {flaggedCount === 1
              ? "Existe 1 presentación con advertencias."
              : `Existen ${flaggedCount} presentaciones con advertencias.`}
          </AlertDescription>
          <AlertAction>
            <Button
              type="button"
              size="sm"
              variant="link"
              onClick={onToggleOnlyWarnings}
            >
              <SquareArrowOutUpRight
                aria-hidden="true"
                data-icon="inline-start"
              />
              {onlyWarnings ? "Ver todas" : "Ver"}
            </Button>
          </AlertAction>
        </Alert>
      ) : null}

      {canEditOrder && !isSortedByOrder ? (
        <p className="text-sm text-muted-foreground">
          Ordená por número para arrastrar.
        </p>
      ) : null}
    </div>
  );
}

/** Rule 5 of the prototype skill: the state after every action. */
export function PrototypeState({
  canDrag,
  caseId,
  flaggedCount,
  log,
  presentationCount,
  selectedCount,
  unorderedCount,
}: {
  canDrag: boolean;
  caseId: PrototypeCaseId;
  flaggedCount: number;
  log: string[];
  presentationCount: number;
  selectedCount: number;
  unorderedCount: number;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Estado del prototipo</CardTitle>
        <CardDescription>caso {caseId}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-xs">
        <p className="tabular-nums">
          Presentaciones {presentationCount} · sin número {unorderedCount} · con
          advertencias {flaggedCount} · elegidas {selectedCount} · arrastre{" "}
          {canDrag ? "activo" : "oculto"}
        </p>
        {log.length > 0 ? (
          <ul className="flex flex-col gap-1 font-mono text-muted-foreground">
            {log.map((entry, index) => (
              <li key={`${index}-${entry}`} className="break-all">
                {entry}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">Todavía no se guardó nada.</p>
        )}
      </CardContent>
    </Card>
  );
}

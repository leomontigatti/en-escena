// PROTOTYPE — throwaway, lives only on branch `prototype/912-participation-list`
// (wayfinder ticket #912, map #907). The notices above the list, and the prototype's state card.
import { AlertTriangle, Info } from "lucide-react";

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import type { PrototypeCaseId } from "./participation-fixtures.prototype";

export function ListNotices({
  canEditOrder,
  flaggedCount,
  hasPresentations,
  isSortedByOrder,
  onlyWarnings,
  onOpenOrdering,
  onToggleOnlyWarnings,
  unorderedCount,
}: {
  canEditOrder: boolean;
  flaggedCount: number;
  hasPresentations: boolean;
  isSortedByOrder: boolean;
  onlyWarnings: boolean;
  onOpenOrdering: () => void;
  onToggleOnlyWarnings: () => void;
  unorderedCount: number;
}) {
  return (
    <div className="flex flex-col gap-3">
      {!hasPresentations ? (
        <Alert>
          <Info aria-hidden="true" />
          <AlertTitle>Todavía no hay orden de presentación</AlertTitle>
          <AlertDescription>
            Las coreografías se muestran por número. Ordenalas automáticamente
            para numerar las presentaciones y poder asignar jueces.
          </AlertDescription>
          <AlertAction>
            <Button type="button" size="sm" onClick={onOpenOrdering}>
              Ordenar automáticamente
            </Button>
          </AlertAction>
        </Alert>
      ) : null}

      {hasPresentations && unorderedCount > 0 ? (
        <Alert>
          <Info aria-hidden="true" />
          <AlertTitle>
            {unorderedCount === 1
              ? "1 coreografía todavía no tiene número"
              : `${unorderedCount} coreografías todavía no tienen número`}
          </AlertTitle>
          <AlertDescription>
            Llegaron después del último orden y aparecen al final. Mientras
            falte su número no se pueden mover filas; ordená automáticamente
            para sumarlas.
          </AlertDescription>
          <AlertAction>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onOpenOrdering}
            >
              Ordenar automáticamente
            </Button>
          </AlertAction>
        </Alert>
      ) : null}

      {flaggedCount > 0 ? (
        <Alert variant="warning">
          <AlertTriangle aria-hidden="true" />
          <AlertDescription>
            {flaggedCount === 1
              ? "1 presentación con advertencias"
              : `${flaggedCount} presentaciones con advertencias`}
          </AlertDescription>
          <AlertAction>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onToggleOnlyWarnings}
            >
              {onlyWarnings ? "Ver todas" : "Ver sólo esas"}
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

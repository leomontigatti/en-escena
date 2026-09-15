// PROTOTYPE — throwaway, lives only on branch `prototype/912-participation-list`
// (wayfinder ticket #912, map #907). The notices above the list, and the prototype's state card.
import {
  AlertTriangle,
  Info,
  ListOrdered,
  SquareArrowOutUpRight,
} from "lucide-react";

import { AlertStack } from "@/components/shared/alert-stack";
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
import type { WarningFilter } from "./participation-list.prototype";

/**
 * Each notice takes the variant of what it says. A choreography that stops the
 * automatic ordering replaces the two ordering notices with a destructive one,
 * and the warnings notice counts only what does not block (fourth review).
 */
export function ListNotices({
  blockingCount,
  canEditOrder,
  flaggedCount,
  hasPresentations,
  isSortedByOrder,
  onOrderAutomatically,
  onToggleWarningFilter,
  unorderedCount,
  warningFilter,
}: {
  blockingCount: number;
  canEditOrder: boolean;
  flaggedCount: number;
  hasPresentations: boolean;
  isSortedByOrder: boolean;
  onOrderAutomatically: () => void;
  onToggleWarningFilter: (filter: WarningFilter) => void;
  unorderedCount: number;
  warningFilter: WarningFilter | null;
}) {
  const isBlocked = blockingCount > 0;

  // `AlertStack` renders nothing without alerts, so an empty stack does not
  // add a second gap above the tabs.
  return (
    <>
      <AlertStack>
        {isBlocked ? (
          <Alert variant="destructive">
            <AlertTriangle aria-hidden="true" />
            <AlertDescription>
              {blockingCount === 1
                ? "Existe 1 coreografía que necesita atención antes de poder ordenar las presentaciones."
                : `Existen ${blockingCount} coreografías que necesitan atención antes de poder ordenar las presentaciones.`}
            </AlertDescription>
            <FilterAction
              isActive={warningFilter === "bloqueantes"}
              onToggle={() => onToggleWarningFilter("bloqueantes")}
            />
          </Alert>
        ) : null}

        {!isBlocked && !hasPresentations ? (
          <Alert variant="info">
            <Info aria-hidden="true" />
            <AlertDescription>
              Las coreografías todavía no tienen un número de presentación
              asignado.
            </AlertDescription>
            <AlertAction className="top-1/2 -translate-y-1/2">
              <Button
                type="button"
                size="sm"
                variant="link"
                onClick={onOrderAutomatically}
              >
                <ListOrdered aria-hidden="true" data-icon="inline-start" />
                Ordenar automáticamente
              </Button>
            </AlertAction>
          </Alert>
        ) : null}

        {!isBlocked && hasPresentations && unorderedCount > 0 ? (
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
            <FilterAction
              isActive={warningFilter === "con"}
              onToggle={() => onToggleWarningFilter("con")}
            />
          </Alert>
        ) : null}
      </AlertStack>

      {canEditOrder && !isSortedByOrder ? (
        <p className="text-sm text-muted-foreground">
          Ordená por número para arrastrar.
        </p>
      ) : null}
    </>
  );
}

function FilterAction({
  isActive,
  onToggle,
}: {
  isActive: boolean;
  onToggle: () => void;
}) {
  return (
    <AlertAction className="top-1/2 -translate-y-1/2">
      <Button type="button" size="sm" variant="link" onClick={onToggle}>
        <SquareArrowOutUpRight aria-hidden="true" data-icon="inline-start" />
        {isActive ? "Ver todas" : "Ver"}
      </Button>
    </AlertAction>
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

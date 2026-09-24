import { Trophy } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  formatEvaluatedPresentations,
  formatPendingEvaluations,
  formatPresentationCount,
  formatResultsPublicationMoment,
} from "@/lib/judging/results-copy";
import { isRouteFormPending, useOptionalNavigation } from "@/lib/shared/forms";

import { eventActionPath, type EventDetailLoaderData } from "./shared";

/**
 * What the event says while results are out: how many the academies see and
 * since when, and — only when the panel has evaluated more — that `Actualizar
 * resultados` is what adds them. Nothing here is gated — only the actions beside
 * it are — so whoever can open the event reads it. Today that is the `admin`
 * alone: story 8's read-only `auditor` needs a route it can reach first.
 */
export function ResultsPublicationAlert({
  publication,
}: {
  publication: EventDetailLoaderData["resultsPublication"];
}) {
  const { pendingCount, publishedAt, publishedCount } = publication;

  if (!publishedAt) {
    return null;
  }

  return (
    <Alert>
      <Trophy aria-hidden="true" className="self-center !translate-y-0" />
      <AlertTitle>Resultados publicados</AlertTitle>
      <AlertDescription className="[&_p:not(:last-child)]:mb-1">
        <p>
          Las academias ven los resultados de{" "}
          {formatPresentationCount(publishedCount)}, publicados{" "}
          {formatResultsPublicationMoment(publishedAt)}.
        </p>
        {pendingCount > 0 ? (
          <p>
            Hay {formatPendingEvaluations(pendingCount)} desde entonces: usá
            &quot;Actualizar resultados&quot; para sumarlas.
          </p>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

export type ResultsAction = "hide-results" | "show-results" | "update-results";

/**
 * The confirmation behind each menu item. `Mostrar` and `Actualizar` post the
 * same `publish-results` intent — a publication is a snapshot of whatever is
 * evaluated at that moment, and the only difference between them is what the
 * administration is told it is about to release.
 */
export function ResultsPublicationDialog({
  action,
  eventId,
  onClose,
  publication,
}: {
  action: ResultsAction | null;
  eventId: string;
  onClose: () => void;
  publication: EventDetailLoaderData["resultsPublication"];
}) {
  const navigation = useOptionalNavigation();
  const { pendingCount, publishedCount } = publication;
  const evaluatedCount = publishedCount + pendingCount;
  const isHiding = action === "hide-results";
  const intent = isHiding ? "hide-results" : "publish-results";
  const isPending = isRouteFormPending(navigation, { intent });

  if (!action) {
    return null;
  }

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{getResultsDialogTitle(action)}</AlertDialogTitle>
          <AlertDialogDescription>
            {getResultsDialogDescription(action, {
              evaluatedCount,
              pendingCount,
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
          <form method="post" action={eventActionPath(eventId)}>
            <input type="hidden" name="intent" value={intent} />
            <Button
              type="submit"
              disabled={isPending}
              variant={isHiding ? "destructive" : "default"}
            >
              {isPending ? <Spinner aria-hidden="true" data-icon /> : null}
              {isHiding ? "Ocultar resultados" : "Publicar resultados"}
            </Button>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function getResultsDialogTitle(action: ResultsAction) {
  switch (action) {
    case "hide-results":
      return "¿Ocultar resultados?";
    case "show-results":
      return "¿Mostrar resultados?";
    case "update-results":
      return "¿Actualizar resultados?";
  }
}

function getResultsDialogDescription(
  action: ResultsAction,
  counts: { evaluatedCount: number; pendingCount: number },
) {
  switch (action) {
    case "hide-results":
      return "Las academias dejan de ver todos los resultados. Para volver a mostrarlos se publica de nuevo lo evaluado en ese momento.";
    case "show-results":
      return `Cada academia ve el premio, el promedio y las devoluciones de ${formatEvaluatedPresentations(counts.evaluatedCount)} hasta ahora. Las que se evalúen después se suman cuando actualices.`;
    case "update-results":
      return `Se publican ${formatEvaluatedPresentations(counts.evaluatedCount)} hasta ahora, ${counts.pendingCount} más que la última vez.`;
  }
}

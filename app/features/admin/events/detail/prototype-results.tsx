// PROTOTYPE (#223) — throwaway, never merge. Publishing results as a
// snapshot, from the event's actions menu. Nothing is written: the state lives
// in memory, and the evaluated count pretends the show goes on after each
// publish so "Actualizar resultados" has something to add.

import { Trophy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

type Snapshot = { count: number; publishedAt: Date };
type Confirmation = "publish" | "update" | "hide" | null;

const initialEvaluatedCount = 144;
const evaluatedPerPublish = 6;

export function usePrototypeResults() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [evaluatedCount, setEvaluatedCount] = useState(initialEvaluatedCount);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);

  function publish() {
    setSnapshot({ count: evaluatedCount, publishedAt: new Date() });
    toast.success(
      `Se publicaron los resultados de ${evaluatedCount} presentaciones.`,
    );
    // The show goes on: a few more get evaluated after each publish.
    setEvaluatedCount((count) => count + evaluatedPerPublish);
    setConfirmation(null);
  }

  function hide() {
    setSnapshot(null);
    toast.success("Se ocultaron los resultados.");
    setConfirmation(null);
  }

  return {
    snapshot,
    evaluatedCount,
    confirmation,
    setConfirmation,
    publish,
    hide,
  };
}

export type PrototypeResults = ReturnType<typeof usePrototypeResults>;

function formatPublishedAt(date: Date) {
  const day = date.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "numeric",
  });
  const time = date.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${day} a las ${time}`;
}

export function PrototypeResultsMenuItems({
  results,
}: {
  results: PrototypeResults;
}) {
  if (!results.snapshot) {
    return (
      <DropdownMenuItem onSelect={() => results.setConfirmation("publish")}>
        Mostrar resultados
      </DropdownMenuItem>
    );
  }

  return (
    <>
      <DropdownMenuItem onSelect={() => results.setConfirmation("update")}>
        Actualizar resultados
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => results.setConfirmation("hide")}>
        Ocultar resultados
      </DropdownMenuItem>
    </>
  );
}

/** What the academies see right now, so the snapshot is never a surprise. */
export function PrototypeResultsAlert({
  results,
}: {
  results: PrototypeResults;
}) {
  const { snapshot, evaluatedCount } = results;
  if (!snapshot) {
    return null;
  }
  const pending = evaluatedCount - snapshot.count;

  return (
    <Alert>
      <Trophy aria-hidden="true" />
      <AlertTitle>Resultados publicados</AlertTitle>
      <AlertDescription>
        Las academias ven los resultados de {snapshot.count} presentaciones,
        publicados el {formatPublishedAt(snapshot.publishedAt)}.
        {pending > 0
          ? ` Hay ${pending} evaluadas desde entonces: usá "Actualizar resultados" para sumarlas.`
          : ""}
      </AlertDescription>
    </Alert>
  );
}

export function PrototypeResultsDialogs({
  results,
}: {
  results: PrototypeResults;
}) {
  const { confirmation, evaluatedCount, snapshot } = results;
  const close = (open: boolean) =>
    open ? null : results.setConfirmation(null);

  return (
    <>
      <AlertDialog open={confirmation === "publish"} onOpenChange={close}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Mostrar resultados?</AlertDialogTitle>
            <AlertDialogDescription>
              Cada academia ve el premio, el promedio y las devoluciones de las{" "}
              {evaluatedCount} presentaciones evaluadas hasta ahora. Las que se
              evalúen después se suman cuando actualices.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button type="button" onClick={results.publish}>
              Mostrar
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmation === "update"} onOpenChange={close}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Actualizar resultados?</AlertDialogTitle>
            <AlertDialogDescription>
              Se publican las {evaluatedCount} presentaciones evaluadas hasta
              ahora, {evaluatedCount - (snapshot?.count ?? 0)} más que la última
              vez.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button type="button" onClick={results.publish}>
              Actualizar
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmation === "hide"} onOpenChange={close}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Ocultar resultados?</AlertDialogTitle>
            <AlertDialogDescription>
              Las academias dejan de ver todos los resultados. Para volver a
              mostrarlos se publica de nuevo lo evaluado en ese momento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button type="button" variant="destructive" onClick={results.hide}>
              Ocultar
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

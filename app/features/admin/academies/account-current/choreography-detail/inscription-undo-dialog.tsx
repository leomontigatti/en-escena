import { AlertTriangle, LoaderCircle, Trash2 } from "lucide-react";
import { useFetcher } from "react-router";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import type { loadAdministrativeChoreographyFinanceDetail } from "./server";
import { deleteAllocationIntent } from "./shared";

type ChoreographyFinanceDetailLoaderData = Awaited<
  ReturnType<typeof loadAdministrativeChoreographyFinanceDetail>
>;
type InscriptionRow =
  ChoreographyFinanceDetailLoaderData["inscriptions"][number];
type UndoableAllocation = NonNullable<InscriptionRow["undoableAllocation"]>;

function stageLabel(stage: UndoableAllocation["stage"]) {
  return stage === "balance" ? "saldo" : "seña";
}

function nextState(stage: UndoableAllocation["stage"]) {
  return stage === "balance" ? "señada" : "impaga";
}

/**
 * Diálogo por fila cuando la única acción disponible es eliminar una asignación:
 * coreografía uniforme `señada`/`pagada`, donde el cobro en bloque vive en el
 * header y la fila solo puede bajar una etapa de esa inscripción. Eliminar la
 * asignación baja una etapa (la `balance` vuelve a `señada`, la `deposit` vuelve
 * a `impaga`) y devuelve el monto liberado al saldo disponible de la academia.
 * No hay confirmación: el admin ya conoce el efecto y puede volver a crearla.
 */
export function InscriptionUndoDialog({
  allocation,
  open,
  onOpenChange,
}: {
  allocation: UndoableAllocation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const fetcher = useFetcher<{ status: "error"; message: string }>();
  const isDeleting = fetcher.state !== "idle";
  const label = stageLabel(allocation.stage);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !isDeleting && onOpenChange(next)}
    >
      <DialogContent overlayClassName="backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle>Eliminar {label}</DialogTitle>
          <DialogDescription>
            Eliminá el pago{" "}
            {allocation.stage === "balance" ? "del saldo" : "de esta seña"} para
            dejar la inscripción {nextState(allocation.stage)}. El monto
            liberado vuelve al saldo disponible de la academia.
          </DialogDescription>
        </DialogHeader>

        {fetcher.data?.status === "error" ? (
          <Alert variant="destructive">
            <AlertTriangle aria-hidden="true" />
            <AlertDescription>{fetcher.data.message}</AlertDescription>
          </Alert>
        ) : null}

        <DialogFooter className="sm:justify-between">
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value={deleteAllocationIntent} />
            <input type="hidden" name="allocationId" value={allocation.id} />
            <Button type="submit" variant="destructive" disabled={isDeleting}>
              {isDeleting ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="animate-spin"
                  data-icon="inline-start"
                />
              ) : (
                <Trash2 aria-hidden="true" data-icon="inline-start" />
              )}
              Eliminar
            </Button>
          </fetcher.Form>

          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={isDeleting}>
              Cerrar
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { AlertTriangle, LoaderCircle, Undo2 } from "lucide-react";
import { useState } from "react";
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

import { formatDancerName } from "./inscription-cobro-dialog";
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
 * Deshacer una asignación baja una etapa de la inscripción sin quitarla del
 * roster: la `balance` vuelve a `señada`, la `deposit` vuelve a `impaga`, y el
 * monto liberado vuelve al `Saldo disponible`. Se ofrece con confirmación en dos
 * pasos porque es una acción destructiva sobre el estado financiero.
 */
export function DeleteAllocationSection({
  inscription,
  allocation,
  disabled,
}: {
  inscription: InscriptionRow;
  allocation: UndoableAllocation;
  disabled?: boolean;
}) {
  const fetcher = useFetcher<{ status: "error"; message: string }>();
  const [confirming, setConfirming] = useState(false);
  const isSaving = fetcher.state !== "idle";
  const label = stageLabel(allocation.stage);

  return (
    <div className="flex flex-col gap-2 rounded-md border border-destructive/30 px-3 py-2">
      {confirming ? (
        <fetcher.Form method="post" className="flex flex-col gap-2">
          <input type="hidden" name="intent" value={deleteAllocationIntent} />
          <input type="hidden" name="allocationId" value={allocation.id} />
          <span className="text-sm">
            ¿Deshacer la {label} de {formatDancerName(inscription)}? La
            inscripción vuelve a {nextState(allocation.stage)} y el monto
            liberado vuelve al saldo disponible.
          </span>

          {fetcher.data?.status === "error" ? (
            <Alert variant="destructive">
              <AlertTriangle aria-hidden="true" />
              <AlertDescription>{fetcher.data.message}</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirming(false)}
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button type="submit" variant="destructive" disabled={isSaving}>
              {isSaving ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="animate-spin"
                  data-icon="inline-start"
                />
              ) : (
                <Undo2 aria-hidden="true" data-icon="inline-start" />
              )}
              Confirmar
            </Button>
          </div>
        </fetcher.Form>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">
            Deshacer devuelve la inscripción a {nextState(allocation.stage)} y
            libera el monto.
          </span>
          <Button
            type="button"
            variant="outline"
            onClick={() => setConfirming(true)}
            disabled={disabled || isSaving}
          >
            <Undo2 aria-hidden="true" data-icon="inline-start" />
            Deshacer {label}
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Diálogo por fila cuando la única acción disponible es deshacer: coreografía
 * uniforme `señada`/`pagada`, donde el cobro en bloque vive en el header y la
 * fila solo puede bajar una etapa de esa inscripción.
 */
export function InscriptionUndoDialog({
  inscription,
  allocation,
  open,
  onOpenChange,
}: {
  inscription: InscriptionRow;
  allocation: UndoableAllocation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent overlayClassName="backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle>Deshacer {stageLabel(allocation.stage)}</DialogTitle>
          <DialogDescription>
            Bajá una etapa de la inscripción de {formatDancerName(inscription)}{" "}
            sin quitarla del roster.
          </DialogDescription>
        </DialogHeader>

        <DeleteAllocationSection
          inscription={inscription}
          allocation={allocation}
        />

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cerrar
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

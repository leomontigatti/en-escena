// PROTOTYPE — throwaway, lives only on branch `prototype/912-participation-list`
// (wayfinder ticket #912, map #907). The ordering confirmation and the judge assignment dialogs.
import { AlertTriangle, Check, ListOrdered } from "lucide-react";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";

import { MultiComboboxField } from "@/components/shared/multi-combobox-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { formatEventSequenceNumber } from "@/lib/events/sequence-number";

import { formatJudgeName } from "./participation-columns.prototype";
import {
  checkAutomaticOrdering,
  judges,
  runAutomaticOrdering,
  type ParticipationRow,
} from "./participation-fixtures.prototype";

/** On the `delete-dialog.tsx` shape: title, description, one alert, details. */
export function OrderingDialog({
  onConfirm,
  onOpenChange,
  rows,
}: {
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  rows: ParticipationRow[];
}) {
  const [isPending, setIsPending] = useState(false);
  const refusal = checkAutomaticOrdering(rows);
  const preview = refusal ? null : runAutomaticOrdering(rows);
  const hasPresentations = rows.some((row) => row.orderNumber !== null);
  const orderedCount =
    preview?.rows.filter((row) => row.orderNumber !== null).length ?? 0;
  const isBlocked = refusal !== null;

  return (
    <AlertDialog open onOpenChange={(open) => !isPending && onOpenChange(open)}>
      <AlertDialogContent
        className="max-h-[calc(100dvh-2rem)]"
        onEscapeKeyDown={(event) => {
          event.preventDefault();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isBlocked ? "No se puede ordenar" : "Ordenar automáticamente"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isBlocked
              ? refusal.reason === "missingCategory"
                ? "Hay coreografías con la seña cubierta que no tienen categoría. Asignales una y volvé a ordenar."
                : "Hay coreografías con la seña cubierta que no tienen cronograma. Asignales uno y volvé a ordenar."
              : `Se van a numerar ${orderedCount} presentaciones por cronograma, categoría y tipo de grupo, desempatando por número de coreografía y separando a los bailarines que se repiten.`}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {isBlocked ? (
          <Alert variant="warning">
            <AlertTriangle aria-hidden="true" />
            <AlertDescription>
              {refusal.rows.length === 1
                ? "1 coreografía impide ordenar."
                : `${refusal.rows.length} coreografías impiden ordenar.`}
            </AlertDescription>
          </Alert>
        ) : hasPresentations ? (
          <Alert variant="destructive">
            <AlertTriangle aria-hidden="true" />
            <AlertDescription>
              Se pierde el orden manual: cada presentación recibe un número
              nuevo. Las asignaciones de juez se mantienen.
            </AlertDescription>
          </Alert>
        ) : null}

        {isBlocked ? (
          <ul className="flex min-h-0 flex-col gap-1 overflow-y-auto text-sm">
            {refusal.rows.map((row) => (
              <li key={row.id} className="tabular-nums">
                {formatEventSequenceNumber(row.choreographyNumber)} · {row.name}{" "}
                <span className="text-muted-foreground">
                  · {row.academyName}
                </span>
              </li>
            ))}
          </ul>
        ) : preview &&
          (preview.removedPresentationCount > 0 ||
            preview.removedAssignmentCount > 0) ? (
          <ul className="flex flex-col gap-1 text-sm">
            {preview.removedPresentationCount > 0 ? (
              <li>
                Se quitarán{" "}
                {formatCount(
                  preview.removedPresentationCount,
                  "presentación con seña pendiente",
                  "presentaciones con seña pendiente",
                )}
                .
              </li>
            ) : null}
            {preview.removedAssignmentCount > 0 ? (
              <li>
                Se quitarán{" "}
                {formatCount(
                  preview.removedAssignmentCount,
                  "asignación de juez",
                  "asignaciones de juez",
                )}
                .
              </li>
            ) : null}
          </ul>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>
            {isBlocked ? "Cerrar" : "Cancelar"}
          </AlertDialogCancel>
          {isBlocked ? null : (
            <Button
              type="button"
              disabled={isPending}
              onClick={() => {
                setIsPending(true);
                window.setTimeout(() => {
                  onConfirm();
                  onOpenChange(false);
                }, 600);
              }}
            >
              {isPending ? (
                <Spinner aria-hidden="true" data-icon="inline-start" />
              ) : (
                <ListOrdered aria-hidden="true" data-icon="inline-start" />
              )}
              Ordenar
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** On the `preset-dialog.tsx` shape: a dialog over the list, acting on the selection. */
export function JudgesDialog({
  mode,
  onConfirm,
  onOpenChange,
  selectedRows,
}: {
  mode: "assign" | "remove";
  onConfirm: (judgeIds: string[]) => void;
  onOpenChange: (open: boolean) => void;
  selectedRows: ParticipationRow[];
}) {
  const form = useForm<{ judgeIds: string[] }>({
    defaultValues: { judgeIds: [] },
  });
  const chosen = useWatch({ control: form.control, name: "judgeIds" });
  const [isSaving, setIsSaving] = useState(false);
  const options =
    mode === "assign"
      ? judges
          .filter((judge) => judge.status === "active")
          .map((judge) => ({ value: judge.id, label: judge.name }))
      : judges
          .filter((judge) =>
            selectedRows.some((row) => row.judgeIds.includes(judge.id)),
          )
          .map((judge) => ({ value: judge.id, label: formatJudgeName(judge) }));

  return (
    <Dialog open onOpenChange={(next) => !isSaving && onOpenChange(next)}>
      <DialogContent overlayClassName="backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle>
            {mode === "assign" ? "Asignar jueces" : "Quitar jueces"}
          </DialogTitle>
          <DialogDescription>
            {selectedRows.length === 1
              ? "1 presentación elegida."
              : `${selectedRows.length} presentaciones elegidas.`}{" "}
            {mode === "assign"
              ? "Cada juez elegido queda asignado a todas; si ya lo estaba en alguna, no se duplica."
              : "Cada juez elegido se quita de las presentaciones elegidas que lo tengan."}
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit((values) => {
            setIsSaving(true);
            window.setTimeout(() => {
              onConfirm(values.judgeIds);
              onOpenChange(false);
            }, 600);
          })}
        >
          <MultiComboboxField
            control={form.control}
            name="judgeIds"
            label="Jueces"
            options={options}
            placeholder="Elegí jueces"
            emptyMessage="No hay jueces para elegir"
          />

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isSaving}>
                Cancelar
              </Button>
            </DialogClose>
            <Button
              type="submit"
              variant={mode === "remove" ? "destructive" : "default"}
              disabled={isSaving || chosen.length === 0}
            >
              {isSaving ? (
                <Spinner aria-hidden="true" data-icon="inline-start" />
              ) : (
                <Check aria-hidden="true" data-icon="inline-start" />
              )}
              {mode === "assign" ? "Asignar" : "Quitar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function formatCount(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

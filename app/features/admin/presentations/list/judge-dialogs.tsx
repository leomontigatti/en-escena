import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { useFetcher } from "react-router";

import { MultiCombobox } from "@/components/shared/multi-combobox";
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
import { Field, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import type { AssignableJudge } from "@/lib/presentations/judge-assignments.server";
import { useServerActionToast } from "@/lib/shared/toasts";

import {
  assignJudgesIntent,
  judgeIdFieldName,
  presentationChoreographyIdFieldName,
  removeJudgesIntent,
  selectRemovableJudges,
  type PresentationListActionData,
  type PresentationListItem,
} from "./shared";

/**
 * The two bulk dialogs of the participation list. They are the same dialog
 * read in both directions — a set of presentations, a set of judges, and which
 * way the pair goes — so they are one component parameterised by the mode
 * rather than two that would drift apart.
 *
 * What each offers is the only real difference: assigning offers every judge
 * of the organisation, because putting one on a presentation needs no prior
 * relation; removing offers only the judges somebody in the selection actually
 * has, because taking off a judge nobody has is not an action to offer.
 *
 * It is a dialog over a list, so the write does not redirect: the outcome comes
 * back in `fetcher.data` and is announced with a toast, and a success closes
 * the dialog over the list the loader has just revalidated.
 */
/**
 * What each direction of the pair is called. Holding it in one place is what
 * keeps the dialog a single component: the two modes differ in their words and
 * in which judges they offer, and in nothing else.
 */
const judgeDialogCopy = {
  assign: {
    emptyMessage: "No hay jueces disponibles",
    intent: assignJudgesIntent,
    note: "Los jueces elegidos se agregan a cada una; las que ya los tenían quedan igual.",
    submitLabel: "Asignar",
    submitVariant: "default",
    title: "Asignar jueces",
  },
  remove: {
    emptyMessage: "Las presentaciones elegidas no tienen jueces asignados",
    intent: removeJudgesIntent,
    note: "Los jueces elegidos se quitan de cada una que los tenga.",
    submitLabel: "Quitar",
    submitVariant: "destructive",
    title: "Quitar jueces",
  },
} as const;

export function JudgeAssignmentDialog({
  mode,
  onOpenChange,
  open,
  assignableJudges,
  assignedJudges,
  selectedRows,
}: {
  assignableJudges: AssignableJudge[];
  assignedJudges: AssignableJudge[];
  mode: "assign" | "remove";
  onOpenChange: (open: boolean) => void;
  open: boolean;
  selectedRows: PresentationListItem[];
}) {
  const fetcher = useFetcher<PresentationListActionData>();
  const [judgeIds, setJudgeIds] = useState<string[]>([]);
  const isSaving = fetcher.state !== "idle";
  const copy = judgeDialogCopy[mode];
  const options = (
    mode === "assign"
      ? assignableJudges
      : selectRemovableJudges(assignedJudges, selectedRows)
  ).map((judge) => ({ label: judge.name, value: judge.id }));

  // The list's action data is a union with the silent answer of a move, which
  // this dialog never receives but the type still admits.
  const actionData =
    fetcher.data && "message" in fetcher.data ? fetcher.data : undefined;

  useServerActionToast(actionData);

  const isDone = actionData?.status === "success";

  useEffect(() => {
    if (isDone) {
      onOpenChange(false);
    }
  }, [isDone, onOpenChange]);

  const closeDialog = () => {
    // The picks belong to one opening of the dialog: the selection they were
    // made against is gone by the next one.
    setJudgeIds([]);
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isSaving) {
          return;
        }

        if (next) {
          onOpenChange(true);
          return;
        }

        closeDialog();
      }}
    >
      <DialogContent overlayClassName="backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>
            {formatSelectionCount(selectedRows.length)} {copy.note}
          </DialogDescription>
        </DialogHeader>

        <fetcher.Form method="post" className="flex flex-col gap-4">
          <input type="hidden" name="intent" value={copy.intent} />
          {selectedRows.map((row) => (
            <input
              key={row.id}
              type="hidden"
              name={presentationChoreographyIdFieldName}
              value={row.id}
            />
          ))}

          <Field>
            <FieldLabel htmlFor="jueces">Jueces</FieldLabel>
            <MultiCombobox
              disabled={isSaving}
              emptyMessage={copy.emptyMessage}
              id="jueces"
              name={judgeIdFieldName}
              onValueChange={setJudgeIds}
              options={options}
              placeholder="Elegí uno o más jueces"
              searchable
              value={judgeIds}
            />
          </Field>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isSaving}>
                Cancelar
              </Button>
            </DialogClose>
            <Button
              type="submit"
              disabled={isSaving || judgeIds.length === 0}
              variant={copy.submitVariant}
            >
              {isSaving ? (
                <Spinner aria-hidden="true" data-icon="inline-start" />
              ) : (
                <Check aria-hidden="true" data-icon="inline-start" />
              )}
              {copy.submitLabel}
            </Button>
          </DialogFooter>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  );
}

function formatSelectionCount(count: number) {
  return count === 1
    ? "1 presentación elegida."
    : `${count} presentaciones elegidas.`;
}

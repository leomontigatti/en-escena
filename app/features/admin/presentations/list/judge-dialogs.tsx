import { zodResolver } from "@hookform/resolvers/zod";
import { Check } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { useFetcher } from "react-router";

import { MultiComboboxField } from "@/components/shared/multi-combobox-field";
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
import { FieldGroup } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import type { AssignableJudge } from "@/lib/presentations/judge-assignments.server";
import { createValidatedReactRouterSubmitHandler } from "@/lib/shared/forms";
import { useServerActionToast } from "@/lib/shared/toasts";

import {
  assignJudgesIntent,
  judgeAssignmentSchema,
  judgeIdFieldName,
  presentationChoreographyIdFieldName,
  removeJudgesIntent,
  selectRemovableJudges,
  type JudgeAssignmentFormValues,
  type JudgeAssignmentSubmissionValues,
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
  const isSaving = fetcher.state !== "idle";
  const copy = judgeDialogCopy[mode];
  const options = (
    mode === "assign"
      ? assignableJudges
      : selectRemovableJudges(assignedJudges, selectedRows)
  ).map((judge) => ({ label: judge.name, value: judge.id }));

  // The chosen rows ride along as a form value, so they need an identity that
  // survives a render of the list: `selectedRows` is rebuilt from the selection
  // every time, and depending on it directly would reset the form forever.
  const selectionKey = selectedRows.map((row) => row.id).join(" ");
  const selectedChoreographyIds = useMemo(
    () => (selectionKey === "" ? [] : selectionKey.split(" ")),
    [selectionKey],
  );

  const form = useForm<
    JudgeAssignmentFormValues,
    unknown,
    JudgeAssignmentSubmissionValues
  >({
    defaultValues: {
      intent: copy.intent,
      [presentationChoreographyIdFieldName]: selectedChoreographyIds,
      [judgeIdFieldName]: [],
    },
    resolver: zodResolver(judgeAssignmentSchema),
  });
  const { reset } = form;

  // The picks belong to one opening of the dialog: the selection they were
  // made against, and the direction they were made in, are gone by the next.
  useEffect(() => {
    reset({
      intent: copy.intent,
      [presentationChoreographyIdFieldName]: selectedChoreographyIds,
      [judgeIdFieldName]: [],
    });
  }, [copy.intent, open, reset, selectedChoreographyIds]);

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

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isSaving) {
          return;
        }

        onOpenChange(next);
      }}
    >
      <DialogContent overlayClassName="backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>
            {formatSelectionCount(selectedRows.length)} {copy.note}
          </DialogDescription>
        </DialogHeader>

        <form
          method="post"
          onSubmit={createValidatedReactRouterSubmitHandler(
            form,
            fetcher.submit,
            { method: "post" },
          )}
          className="flex flex-col gap-4"
        >
          <FieldGroup>
            <MultiComboboxField
              control={form.control}
              disabled={isSaving}
              emptyMessage={copy.emptyMessage}
              label="Jueces"
              name={judgeIdFieldName}
              options={options}
              placeholder="Elegí uno o más jueces"
              searchable
            />
          </FieldGroup>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isSaving}>
                Cancelar
              </Button>
            </DialogClose>
            <Button
              type="submit"
              disabled={isSaving}
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
        </form>
      </DialogContent>
    </Dialog>
  );
}

function formatSelectionCount(count: number) {
  return count === 1
    ? "1 presentación elegida."
    : `${count} presentaciones elegidas.`;
}

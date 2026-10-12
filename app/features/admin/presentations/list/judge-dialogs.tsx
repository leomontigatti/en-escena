import { zodResolver } from "@hookform/resolvers/zod";
import { Check } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { useFetcher } from "react-router";

import { Checklist } from "@/components/shared/checklist-field";
import {
  DiscardChangesDialog,
  useDiscardGuard,
} from "@/components/shared/discard-guard";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldLegend, FieldSet } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import type { AssignableJudge } from "@/lib/presentations/judge-assignments.server";
import { createValidatedReactRouterSubmitHandler } from "@/lib/shared/forms";
import { useServerActionToast } from "@/lib/shared/toasts";

import {
  editJudgesIntent,
  judgeEditSchema,
  judgeToAddFieldName,
  judgeToRemoveFieldName,
  presentationChoreographyIdFieldName,
  readJudgeChoices,
  type JudgeChoice,
  type JudgeEditFormValues,
  type JudgeEditSubmissionValues,
  type PresentationListActionData,
  type PresentationListItem,
} from "./shared";

/**
 * The bulk judge dialog of the participation list: a set of presentations and
 * every judge, each checkbox starting from where its judge stands across the
 * set. Checked is on every chosen row, unchecked on none, mixed on some. A
 * judge left as it starts is left as it is, so a mixed one stays on exactly
 * the rows that had it; checked, it goes onto all of them, and unchecked, off
 * all of them.
 *
 * It is a dialog over a list, so the write does not redirect: the outcome comes
 * back in `fetcher.data` and is announced with a toast, and a success closes
 * the dialog over the list the loader has just revalidated.
 */
export function JudgeEditDialog({
  onOpenChange,
  open,
  assignableJudges,
  assignedJudges,
  selectedRows,
}: {
  assignableJudges: AssignableJudge[];
  assignedJudges: AssignableJudge[];
  onOpenChange: (open: boolean) => void;
  open: boolean;
  selectedRows: PresentationListItem[];
}) {
  const fetcher = useFetcher<PresentationListActionData>();
  const isSaving = fetcher.state !== "idle";
  const choices = readJudgeChoices({
    assignableJudges,
    assignedJudges,
    selectedRows,
  });

  // The chosen rows ride along as a form value, so they need an identity that
  // survives a render of the list: `selectedRows` is rebuilt from the selection
  // every time, and depending on it directly would reset the form forever.
  const selectionKey = selectedRows.map((row) => row.id).join(" ");
  const selectedChoreographyIds = useMemo(
    () => (selectionKey === "" ? [] : selectionKey.split(" ")),
    [selectionKey],
  );

  const form = useForm<JudgeEditFormValues, unknown, JudgeEditSubmissionValues>(
    {
      defaultValues: {
        intent: editJudgesIntent,
        [presentationChoreographyIdFieldName]: selectedChoreographyIds,
        [judgeToAddFieldName]: [],
        [judgeToRemoveFieldName]: [],
      },
      resolver: zodResolver(judgeEditSchema),
    },
  );
  const { reset, setValue } = form;
  const toAdd = form.watch(judgeToAddFieldName);
  const toRemove = form.watch(judgeToRemoveFieldName);

  // The changes belong to one opening of the dialog: the selection they were
  // made against is gone by the next.
  useEffect(() => {
    reset({
      intent: editJudgesIntent,
      [presentationChoreographyIdFieldName]: selectedChoreographyIds,
      [judgeToAddFieldName]: [],
      [judgeToRemoveFieldName]: [],
    });
  }, [open, reset, selectedChoreographyIds]);

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

  const byId = new Map(choices.map((choice) => [choice.id, choice]));
  const change = { toAdd, toRemove };
  const hasChanges = toAdd.length + toRemove.length > 0;
  const { discardDialogProps, requestClose } = useDiscardGuard({
    isAudioDirty: false,
    isFormDirty: hasChanges,
    onClose: () => onOpenChange(false),
  });

  function toggle(judgeId: string) {
    const choice = byId.get(judgeId);

    if (!choice) {
      return;
    }

    const next = cycleJudgeChange(choice, change);

    setValue(judgeToAddFieldName, next.toAdd);
    setValue(judgeToRemoveFieldName, next.toRemove);
  }

  // Changes picked and not saved are asked about on every way out: Esc, the
  // close button and `Cancelar`. A save in flight holds the dialog open.
  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && !isSaving) {
            requestClose();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar jueces</DialogTitle>
            <DialogDescription>
              {formatSelectionCount(selectedRows.length)} Un juez marcado queda
              en todas y uno desmarcado, en ninguna. El que está solo en algunas
              aparece a medias y, si no lo tocás, queda igual.
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
            <FieldSet className="gap-2">
              <FieldLegend variant="label">Jueces</FieldLegend>
              <Checklist
                checkedStateOf={(judgeId) => {
                  const choice = byId.get(judgeId);

                  return choice ? readJudgeCheckedState(choice, change) : false;
                }}
                disabled={isSaving}
                emptySelectionMessage="Ningún juez queda en las presentaciones elegidas."
                label="Jueces"
                noOptionsMessage="No hay jueces disponibles."
                onToggle={toggle}
                options={choices.map((choice) => ({
                  label: choice.name,
                  value: choice.id,
                }))}
                searchLabel="Buscar jueces"
              />
            </FieldSet>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={isSaving}
                onClick={requestClose}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSaving || !hasChanges}>
                {isSaving ? (
                  <Spinner aria-hidden="true" data-icon="inline-start" />
                ) : (
                  <Check aria-hidden="true" data-icon="inline-start" />
                )}
                Guardar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <DiscardChangesDialog {...discardDialogProps} />
    </>
  );
}

type JudgeChange = { toAdd: string[]; toRemove: string[] };

type JudgeCheckedState = boolean | "indeterminate";

/** Where a judge's checkbox starts: where the judge stands across the rows. */
function readStartingState(choice: JudgeChoice): JudgeCheckedState {
  return choice.state === "some" ? "indeterminate" : choice.state === "all";
}

/** The checkbox of a judge: where it started, unless the dialog changed it. */
function readJudgeCheckedState(
  choice: JudgeChoice,
  change: JudgeChange,
): JudgeCheckedState {
  if (change.toAdd.includes(choice.id)) {
    return true;
  }

  if (change.toRemove.includes(choice.id)) {
    return false;
  }

  return readStartingState(choice);
}

/**
 * A click on a judge. Checked unchecks and unchecked checks, except that a
 * judge on some of the rows goes round through mixed, so the reader can always
 * get back to leaving it as it was. A judge no longer assignable is never
 * added, so it only goes between where it started and off. A state equal to
 * the start is no change.
 */
function cycleJudgeChange(
  choice: JudgeChoice,
  change: JudgeChange,
): JudgeChange {
  const start = readStartingState(choice);
  const next = readNextCheckedState(
    choice,
    readJudgeCheckedState(choice, change),
  );
  const toAdd = change.toAdd.filter((judgeId) => judgeId !== choice.id);
  const toRemove = change.toRemove.filter((judgeId) => judgeId !== choice.id);

  if (next === start) {
    return { toAdd, toRemove };
  }

  return next
    ? { toAdd: [...toAdd, choice.id], toRemove }
    : { toAdd, toRemove: [...toRemove, choice.id] };
}

function readNextCheckedState(
  choice: JudgeChoice,
  current: JudgeCheckedState,
): JudgeCheckedState {
  const start = readStartingState(choice);

  if (!choice.assignable) {
    return current === start ? false : start;
  }

  if (current === "indeterminate") {
    return true;
  }

  if (current === true) {
    return false;
  }

  if (choice.state === "some") {
    return "indeterminate";
  }

  return true;
}

function formatSelectionCount(count: number) {
  return count === 1
    ? "1 presentación elegida."
    : `${count} presentaciones elegidas.`;
}

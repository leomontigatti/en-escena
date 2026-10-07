import { zodResolver } from "@hookform/resolvers/zod";
import { Merge } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import {
  ComboboxField,
  type ComboboxFieldOption,
} from "@/components/shared/combobox-field";
import { IrreversibleActionAlert } from "@/components/shared/irreversible-action-alert";
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
import { isMergeRefusal, mergeSurvivorFieldName } from "@/lib/shared/merge";
import {
  createValidatedRouteSubmitHandler,
  isRouteFormPending,
  requiredFieldMessage,
  useOptionalFormAction,
  useOptionalNavigation,
  useOptionalSubmit,
} from "@/lib/shared/forms";
import { useServerActionToast } from "@/lib/shared/toasts";

const mergeFormSchema = z.object({
  [mergeSurvivorFieldName]: z.string().min(1, requiredFieldMessage),
});

type MergeFormValues = z.infer<typeof mergeFormSchema>;

const mergeRefusalToastId = "admin-merge:refusal";

/**
 * The panel's one merge confirmation, for two people and for two academies
 * (PRD #1187). The record on screen is the one removed; the operator picks the
 * survivor, reads what moves and what is lost, and confirms. The summary is the
 * caller's, because what moves differs by kind; the dialog owns the pick and
 * the post. The refusal the server answers with is a toast
 * (`useMergeDialogState`), and the dialog stays open under it.
 */
export function MergeDialog({
  candidates,
  description,
  emptyMessage,
  intentValue,
  label,
  onOpenChange,
  open,
  recordId,
  renderSummary,
  title,
}: {
  candidates: ComboboxFieldOption[];
  description: ReactNode;
  emptyMessage: string;
  intentValue: string;
  label: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  recordId: string;
  renderSummary: (survivorId: string) => ReactNode;
  title: string;
}) {
  const navigation = useOptionalNavigation();
  const submit = useOptionalSubmit();
  const formAction = useOptionalFormAction();
  const isPending = isRouteFormPending(navigation, {
    intent: intentValue,
    fields: { id: recordId },
  });
  const form = useForm<MergeFormValues>({
    defaultValues: { [mergeSurvivorFieldName]: "" },
    resolver: zodResolver(mergeFormSchema),
  });
  const { reset } = form;
  const survivorId = form.watch(mergeSurvivorFieldName);

  // A pick belongs to one opening: the next one starts from nobody chosen.
  useEffect(() => {
    if (!open) {
      reset({ [mergeSurvivorFieldName]: "" });
    }
  }, [open, reset]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isPending) {
          return;
        }

        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form
          method="post"
          noValidate
          onSubmit={createValidatedRouteSubmitHandler(form, submit, formAction)}
          className="flex flex-col gap-4"
        >
          <input type="hidden" name="intent" value={intentValue} />
          <input type="hidden" name="id" value={recordId} />
          <FieldGroup>
            <ComboboxField
              control={form.control}
              emptyMessage={emptyMessage}
              label={label}
              name={mergeSurvivorFieldName}
              options={candidates}
              placeholder="Elegir"
            />
          </FieldGroup>

          {survivorId ? renderSummary(survivorId) : null}

          <IrreversibleActionAlert />

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isPending}>
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" variant="destructive" disabled={isPending}>
              {isPending ? (
                <Spinner aria-hidden="true" data-icon="inline-start" />
              ) : (
                <Merge aria-hidden="true" data-icon="inline-start" />
              )}
              Fusionar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The dialog's open state on a detail page. A refused merge leaves the
 * operator on the same page with the same choice to make, so each refusal
 * toasts its reason and opens the dialog again. A refusal is an `"error"`
 * answer carrying `mergeIntent`; an error of any other form is not the
 * dialog's. The state belongs to one record: a merge redirects to the
 * survivor's page, which is the same route component with another id, and the
 * dialog must not follow the operator there.
 */
export function useMergeDialogState<ActionData extends { status: string }>(
  recordId: string,
  actionData: ActionData | undefined,
  mergeIntent: string,
) {
  const [openFor, setOpenFor] = useState<string | null>(
    isMergeRefusal(actionData, mergeIntent) ? recordId : null,
  );

  // One object per answer, so a second identical refusal toasts again and a
  // re-render does not.
  const refusal = useMemo(
    () =>
      isMergeRefusal(actionData, mergeIntent)
        ? { message: actionData.message, status: "error" as const }
        : undefined,
    [actionData, mergeIntent],
  );

  useServerActionToast(refusal, { toastId: mergeRefusalToastId });

  useEffect(() => {
    if (refusal) {
      setOpenFor(recordId);
    }
  }, [recordId, refusal]);

  return {
    onOpenChange: (open: boolean) => setOpenFor(open ? recordId : null),
    open: openFor === recordId,
  };
}

/** The two lists every merge confirmation reads: what moves and what is lost. */
export function MergeSummary({
  discards,
  moves,
  survivorName,
}: {
  discards: string[];
  moves: string[];
  survivorName: string;
}) {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex flex-col gap-1">
        <p className="font-medium">Pasa a {survivorName}</p>
        {moves.length > 0 ? (
          <ul className="list-disc pl-5 text-muted-foreground">
            {moves.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">Nada: no tiene inscripciones.</p>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <p className="font-medium">Se descarta</p>
        <ul className="list-disc pl-5 text-muted-foreground">
          {discards.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircleIcon, Merge } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import {
  ComboboxField,
  type ComboboxFieldOption,
} from "@/components/shared/combobox-field";
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
import { FieldGroup } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { mergeSurvivorFieldName } from "@/lib/shared/merge";
import {
  createValidatedRouteSubmitHandler,
  isRouteFormPending,
  useOptionalFormAction,
  useOptionalNavigation,
  useOptionalSubmit,
} from "@/lib/shared/forms";

const mergeFormSchema = z.object({
  [mergeSurvivorFieldName]: z.string().min(1, "Elegí con quién fusionar."),
});

type MergeFormValues = z.infer<typeof mergeFormSchema>;

/**
 * The panel's one merge confirmation, for two people and for two academies
 * (PRD #1187). The record on screen is the one removed; the operator picks the
 * survivor, reads what moves and what is lost, and confirms. The summary is the
 * caller's, because what moves differs by kind; the dialog owns the pick, the
 * post and the refusal the server answers with, which is shown here because a
 * refused merge leaves the operator on the same screen with the same choice.
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
  refusal,
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
  refusal?: string;
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
      <DialogContent overlayClassName="backdrop-blur-sm">
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

          <Alert variant="destructive">
            <AlertCircleIcon aria-hidden="true" />
            <AlertDescription>
              {refusal ?? "Esta acción es irreversible."}
            </AlertDescription>
          </Alert>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isPending}>
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" variant="destructive" disabled={isPending}>
              {isPending ? (
                <Spinner aria-hidden="true" data-icon />
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
 * opens the dialog again with its reason. The state belongs to one record: a
 * merge redirects to the survivor's page, which is the same route component
 * with another id, and the dialog must not follow the operator there.
 */
export function useMergeDialogState(
  recordId: string,
  actionData: { status: string; message?: string } | undefined,
) {
  const refusal =
    actionData?.status === "merge-refused" ? actionData.message : undefined;
  const [openFor, setOpenFor] = useState<string | null>(
    refusal === undefined ? null : recordId,
  );

  useEffect(() => {
    if (actionData?.status === "merge-refused") {
      setOpenFor(recordId);
    }
  }, [actionData, recordId]);

  return {
    onOpenChange: (open: boolean) => setOpenFor(open ? recordId : null),
    open: openFor === recordId,
    refusal,
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

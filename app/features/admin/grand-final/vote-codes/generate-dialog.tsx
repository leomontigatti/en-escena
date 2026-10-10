import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect } from "react";
import { useForm } from "react-hook-form";
import { useFetcher } from "react-router";

import {
  DiscardChangesDialog,
  useDiscardGuard,
} from "@/components/shared/discard-guard";
import { IntegerInputField } from "@/components/shared/integer-input-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { createValidatedReactRouterSubmitHandler } from "@/lib/shared/forms";
import { useServerActionToast } from "@/lib/shared/toasts";

import type { GrandFinalListActionData } from "../list/shared";
import {
  createVoteCodeBatchIntent,
  createVoteCodeBatchSchema,
  maxVoteCodeBatchSize,
  type CreateVoteCodeBatchFormValues,
} from "./shared";

/**
 * Issues a batch of `voteCode`s: administration says how many, and the new
 * batch joins the list's `Códigos QR`, from where it prints. A dialog over the
 * list, so the write stays and its answer is a toast; a success closes it
 * (docs/agents/form-feedback.md).
 */
export function GenerateVoteCodeBatchDialog({
  onOpenChange,
}: {
  onOpenChange: (open: boolean) => void;
}) {
  const fetcher = useFetcher<GrandFinalListActionData>();
  const isSaving = fetcher.state !== "idle";
  const form = useForm<CreateVoteCodeBatchFormValues>({
    defaultValues: { count: "", intent: createVoteCodeBatchIntent },
    resolver: zodResolver(createVoteCodeBatchSchema),
  });
  const count = form.watch("count");

  useServerActionToast(fetcher.data);

  const isDone = fetcher.data?.status === "success";
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  const { discardDialogProps, requestClose } = useDiscardGuard({
    isAudioDirty: false,
    isFormDirty: count.trim() !== "",
    onClose: close,
  });

  useEffect(() => {
    if (isDone) {
      onOpenChange(false);
    }
  }, [isDone, onOpenChange]);

  return (
    <>
      <Dialog
        open
        onOpenChange={(next) => {
          if (!next && !isSaving) {
            requestClose();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generar códigos QR</DialogTitle>
            <DialogDescription>
              Cada código QR vale un voto de 30 puntos en la Gran final y se usa
              una sola vez por votación. El lote se imprime desde la lista.
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
              <IntegerInputField
                control={form.control}
                disabled={isSaving}
                label="Cantidad de códigos"
                name="count"
                placeholder={`Entre 1 y ${maxVoteCodeBatchSize}`}
              />
            </FieldGroup>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={isSaving}
                onClick={requestClose}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSaving || count.trim() === ""}>
                {isSaving ? (
                  <Spinner aria-hidden="true" data-icon="inline-start" />
                ) : null}
                Generar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <DiscardChangesDialog {...discardDialogProps} />
    </>
  );
}

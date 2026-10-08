import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect } from "react";
import { useForm } from "react-hook-form";
import { useFetcher } from "react-router";

import { SubmitButton } from "@/components/shared/action-buttons";
import {
  DiscardChangesDialog,
  useDiscardGuard,
} from "@/components/shared/discard-guard";
import { SelectField } from "@/components/shared/select-field";
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
import type { GrandFinalPicks } from "@/lib/grand-final/picks-overview.server";
import { createValidatedReactRouterSubmitHandler } from "@/lib/shared/forms";
import { useServerActionToast } from "@/lib/shared/toasts";

import {
  finalistPickChangeSchema,
  currentPick,
  setFinalistPickIntent,
  type FinalistPickChangeFormValues,
  type GrandFinalListActionData,
} from "./shared";

/**
 * Administration's change of any judge's `finalistPick`, at any time. Choosing
 * the modality and the judge puts the academy on that judge's current pick, so
 * the dialog reads what is there before it changes it, and `Guardar` waits for
 * a different academy.
 *
 * It is a dialog over the list, so the write stays: the answer comes back in
 * `fetcher.data` as a toast, and a success closes the dialog over the list the
 * loader has just revalidated (docs/agents/form-feedback.md).
 */
export function FinalistPickChangeDialog({
  onOpenChange,
  picks,
}: {
  onOpenChange: (open: boolean) => void;
  picks: GrandFinalPicks;
}) {
  const fetcher = useFetcher<GrandFinalListActionData>();
  const isSaving = fetcher.state !== "idle";
  const form = useForm<FinalistPickChangeFormValues>({
    defaultValues: {
      academyId: "",
      intent: setFinalistPickIntent,
      judgeId: "",
      modalityId: "",
    },
    resolver: zodResolver(finalistPickChangeSchema),
  });
  const { setValue } = form;
  const [modalityId, judgeId, academyId] = form.watch([
    "modalityId",
    "judgeId",
    "academyId",
  ]);
  const modality = picks.modalities.find(
    (row) => row.modalityId === modalityId,
  );
  const picked = currentPick(modality, judgeId);

  // A new modality or judge is a new pick to look at: start from theirs, even
  // when it is the same academy, so a draft never moves to another judge.
  useEffect(() => {
    setValue("academyId", picked);
  }, [judgeId, modalityId, picked, setValue]);

  useServerActionToast(fetcher.data);

  const isDone = fetcher.data?.status === "success";
  // The draft is an academy other than the judge's saved one; choosing which
  // pick to look at is not worth asking about.
  const isDraft = academyId !== "" && academyId !== picked;
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  const { discardDialogProps, requestClose } = useDiscardGuard({
    isAudioDirty: false,
    isFormDirty: isDraft,
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
            <DialogTitle>Cambiar elección de finalista</DialogTitle>
            <DialogDescription>
              Elegí la modalidad y el juez para ver su elección y cambiarla por
              otra academia que cumpla los requisitos.
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
              <SelectField
                control={form.control}
                disabled={isSaving}
                label="Modalidad"
                name="modalityId"
                options={picks.modalities
                  .filter((row) =>
                    row.academies.some((entry) => entry.eligible),
                  )
                  .map((row) => ({
                    label: row.modalityName,
                    value: row.modalityId,
                  }))}
                placeholder="Elegí una modalidad"
              />
              <SelectField
                control={form.control}
                disabled={isSaving}
                label="Juez"
                name="judgeId"
                options={picks.judges.map((judge) => ({
                  label: judge.name,
                  value: judge.id,
                }))}
                placeholder="Elegí un juez"
              />
              <SelectField
                control={form.control}
                disabled={isSaving}
                label="Academia"
                name="academyId"
                // The judge's pick stays an option after its academy stopped
                // being eligible, so it reads as what was picked; saving it
                // again is the server's to refuse.
                options={(modality?.academies ?? [])
                  .filter((row) => row.eligible || row.academyId === picked)
                  .map((row) => ({ label: row.name, value: row.academyId }))}
                placeholder={
                  modality && judgeId !== ""
                    ? "Sin elección"
                    : "Elegí una academia"
                }
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
              <SubmitButton disabled={!isDraft} isPending={isSaving} />
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <DiscardChangesDialog {...discardDialogProps} />
    </>
  );
}

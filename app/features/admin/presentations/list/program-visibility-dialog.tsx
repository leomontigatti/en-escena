import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useId } from "react";
import { Controller, useForm } from "react-hook-form";
import { useFetcher } from "react-router";

import { SubmitButton } from "@/components/shared/action-buttons";
import { ChoiceCard } from "@/components/shared/choice-card";
import {
  DiscardChangesDialog,
  useDiscardGuard,
} from "@/components/shared/discard-guard";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldError, FieldLegend, FieldSet } from "@/components/ui/field";
import { formatScheduleDayTabLabel } from "@/lib/choreographies/schedule-formatters";
import { createValidatedReactRouterSubmitHandler } from "@/lib/shared/forms";
import { useServerActionToast } from "@/lib/shared/toasts";

import {
  programEventIdFieldName,
  programVisibilitySchema,
  programVisibleDayFieldName,
  setProgramVisibilityIntent,
  type PresentationListActionData,
  type ProgramVisibilityFormValues,
} from "./shared";

/**
 * Chooses which days of the program the public page and the academies'
 * portal show. Each listed day is a checkbox that starts as the day is now,
 * and `Guardar` sends the whole set, so the days left unchecked are hidden.
 * The form carries the event it was opened for, which the action checks is
 * still the active one.
 *
 * It is a dialog over a list, like the judge dialogs: the save goes through a
 * fetcher, its answer is announced with a toast, and only a success closes the
 * dialog, so a refusal leaves the picks in place to try again. Leaving with
 * unsaved picks asks first. The days are few — one per day of the event — so
 * they are drawn in place rather than through `ChecklistField`, whose search
 * and `Seleccionados` tab are for long lists.
 */
export function ProgramVisibilityDialog({
  days,
  eventId,
  onClose,
}: {
  /** In date order, each with whether it is visible now. */
  days: Array<{ day: string; visible: boolean }>;
  eventId: string;
  onClose: () => void;
}) {
  const id = useId();
  const fetcher = useFetcher<PresentationListActionData>();
  const isSaving = fetcher.state !== "idle";
  const form = useForm<ProgramVisibilityFormValues>({
    defaultValues: {
      [programVisibleDayFieldName]: days
        .filter((entry) => entry.visible)
        .map((entry) => entry.day),
    },
    resolver: zodResolver(programVisibilitySchema),
  });
  const { discardDialogProps, requestClose } = useDiscardGuard({
    // The guard also counts a recorded audio for the judges; there is none here.
    isAudioDirty: false,
    isFormDirty: form.formState.isDirty,
    onClose,
  });

  // The list's action data is a union with the silent answer of a move, which
  // this dialog never receives but the type still admits.
  const actionData =
    fetcher.data && "message" in fetcher.data ? fetcher.data : undefined;

  useServerActionToast(actionData);

  const isDone = actionData?.status === "success";

  useEffect(() => {
    if (isDone) {
      onClose();
    }
  }, [isDone, onClose]);

  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open && !isSaving) {
            requestClose();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mostrar/ocultar programa</DialogTitle>
            <DialogDescription>
              Elegí los días que se muestran públicamente y en el portal de las
              academias. Los números de un día sin mostrar no se publican,
              porque todavía pueden cambiar.
            </DialogDescription>
          </DialogHeader>

          <form
            method="post"
            noValidate
            onSubmit={createValidatedReactRouterSubmitHandler(
              form,
              fetcher.submit,
              { method: "post" },
            )}
            className="flex flex-col gap-4"
          >
            <input
              type="hidden"
              name="intent"
              value={setProgramVisibilityIntent}
            />
            <input
              type="hidden"
              name={programEventIdFieldName}
              value={eventId}
            />

            <Controller
              control={form.control}
              name={programVisibleDayFieldName}
              render={({ field, fieldState }) => (
                <FieldSet>
                  <FieldLegend variant="label">Días visibles</FieldLegend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {days.map(({ day }) => (
                      <ChoiceCard
                        key={day}
                        disabled={isSaving}
                        htmlFor={`${id}-${day}`}
                        label={formatScheduleDayTabLabel(day)}
                      >
                        <Checkbox
                          id={`${id}-${day}`}
                          checked={field.value.includes(day)}
                          disabled={isSaving}
                          onCheckedChange={(checked) =>
                            field.onChange(
                              checked === true
                                ? [...field.value, day].sort()
                                : field.value.filter((value) => value !== day),
                            )
                          }
                        />
                      </ChoiceCard>
                    ))}
                  </div>
                  <FieldError>{fieldState.error?.message}</FieldError>
                </FieldSet>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={isSaving}
                onClick={requestClose}
              >
                Cancelar
              </Button>
              <SubmitButton
                disabled={!form.formState.isDirty}
                isPending={isSaving}
              />
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <DiscardChangesDialog {...discardDialogProps} />
    </>
  );
}

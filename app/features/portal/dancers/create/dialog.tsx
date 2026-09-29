import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useId } from "react";
import { useForm } from "react-hook-form";
import type { FetcherSubmitFunction } from "react-router";

import { SubmitButton } from "@/components/shared/action-buttons";
import {
  DiscardChangesDialog,
  useDiscardGuard,
} from "@/components/shared/discard-guard";
import { DateOnlyField } from "@/components/shared/date-only-field";
import {
  documentTypeEmptyLabel,
  documentTypeOptions,
} from "@/components/shared/document-type-options";
import { useRosterDocumentConflictField } from "@/components/shared/roster-document-conflict";
import { RosterNameWarningNotice } from "@/components/shared/roster-name-warning";
import { SelectField } from "@/components/shared/select-field";
import { TextInputField } from "@/components/shared/text-input-field";
import { getBirthDatePickerBounds } from "@/lib/dancers/birth-date";
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
import { createValidatedReactRouterSubmitHandler } from "@/lib/shared/forms";
import {
  buildCreateDancerSchema,
  createDancerIntent,
  getCreateDancerDocumentConflict,
  emptyDancerValues,
  type CreateDancerActionData,
  type CreateDancerFormValues,
} from "@/features/portal/dancers/create/shared";

export function CreateDancerDialog({
  actionData,
  eventStartDate,
  isOpen,
  isSubmitting,
  onOpenChange,
  submit,
}: {
  actionData?: Extract<CreateDancerActionData, { status: "error" | "warning" }>;
  eventStartDate: string | null;
  isOpen: boolean;
  isSubmitting: boolean;
  onOpenChange: (nextOpen: boolean) => void;
  submit: FetcherSubmitFunction;
}) {
  const birthDateId = useId();
  const form = useForm<CreateDancerFormValues>({
    resolver: zodResolver(buildCreateDancerSchema(eventStartDate)),
    defaultValues: actionData?.values ?? emptyDancerValues,
  });

  // A refused save refills what was typed, and it stays a change: it is
  // measured against the empty form, so `Guardar` stays on and closing asks.
  useEffect(() => {
    form.reset(emptyDancerValues);

    if (actionData?.values) {
      form.reset(actionData.values, { keepDefaultValues: true });
    }
  }, [actionData?.values, form]);
  const { discardDialogProps, requestClose } = useDiscardGuard({
    isAudioDirty: false,
    isFormDirty: form.formState.isDirty,
    onClose: () => onOpenChange(false),
  });

  const documentConflictDescription = useRosterDocumentConflictField({
    actionData: actionData?.status === "error" ? actionData : undefined,
    conflict: getCreateDancerDocumentConflict(actionData),
    name: "documentNumber",
    setError: form.setError,
  });

  return (
    <>
      <Dialog
        open={isOpen}
        onOpenChange={(nextOpen) => {
          if (nextOpen) {
            onOpenChange(true);
          } else {
            requestClose();
          }
        }}
      >
        <DialogContent overlayClassName="backdrop-blur-sm">
          <DialogHeader>
            <DialogTitle>Nuevo bailarín</DialogTitle>
            <DialogDescription>
              Ingresá los datos mínimos para cargarlo en la academia.
            </DialogDescription>
          </DialogHeader>

          <form
            method="post"
            onSubmit={createValidatedReactRouterSubmitHandler(form, submit, {
              method: "post",
            })}
            className="flex flex-col gap-5"
          >
            <input type="hidden" name="intent" value={createDancerIntent} />
            <FieldGroup>
              <TextInputField
                autoComplete="given-name"
                control={form.control}
                label="Nombre"
                name="firstName"
              />

              <TextInputField
                autoComplete="family-name"
                control={form.control}
                label="Apellido"
                name="lastName"
              />

              <DateOnlyField
                control={form.control}
                name="birthDate"
                id={birthDateId}
                label="Fecha de nacimiento"
                calendarBounds={getBirthDatePickerBounds(eventStartDate)}
              />

              <SelectField
                allowEmpty
                control={form.control}
                emptyLabel={documentTypeEmptyLabel}
                label="Tipo de documento"
                name="documentType"
                options={documentTypeOptions}
                placeholder={documentTypeEmptyLabel}
              />

              <TextInputField
                autoComplete="off"
                control={form.control}
                description={documentConflictDescription}
                label="Número de documento"
                name="documentNumber"
              />
            </FieldGroup>

            {actionData?.status === "warning" ? (
              <RosterNameWarningNotice warning={actionData.warning} />
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting}
                onClick={requestClose}
              >
                Cancelar
              </Button>
              {actionData?.status === "warning" ? null : (
                <SubmitButton
                  disabled={!form.formState.isDirty}
                  isPending={isSubmitting}
                />
              )}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <DiscardChangesDialog {...discardDialogProps} />
    </>
  );
}

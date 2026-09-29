import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useId } from "react";
import { useForm } from "react-hook-form";
import type { FetcherSubmitFunction } from "react-router";

import { SubmitButton } from "@/components/shared/action-buttons";
import {
  DiscardChangesDialog,
  useDiscardGuard,
} from "@/components/shared/discard-guard";
import {
  documentTypeEmptyLabel,
  documentTypeOptions,
} from "@/components/shared/document-type-options";
import { useRosterDocumentConflictField } from "@/components/shared/roster-document-conflict";
import { RosterNameWarningDialog } from "@/components/shared/roster-name-warning";
import { SelectField } from "@/components/shared/select-field";
import { TextInputField } from "@/components/shared/text-input-field";
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
  createProfessorIntent,
  getCreateProfessorDocumentConflict,
  createProfessorSchema,
  emptyProfessorValues,
  type CreateProfessorActionData,
  type CreateProfessorFormValues,
} from "@/features/portal/professors/create/shared";

export function CreateProfessorDialog({
  actionData,
  isOpen,
  isSubmitting,
  onOpenChange,
  submit,
}: {
  actionData?: Extract<
    CreateProfessorActionData,
    { status: "error" | "warning" }
  >;
  isOpen: boolean;
  isSubmitting: boolean;
  onOpenChange: (nextOpen: boolean) => void;
  submit: FetcherSubmitFunction;
}) {
  const formId = useId();
  const form = useForm<CreateProfessorFormValues>({
    resolver: zodResolver(createProfessorSchema),
    defaultValues: actionData?.values ?? emptyProfessorValues,
  });

  // A refused save refills what was typed, and it stays a change: it is
  // measured against the empty form, so `Guardar` stays on and closing asks.
  useEffect(() => {
    form.reset(emptyProfessorValues);

    if (actionData?.values) {
      form.reset(actionData.values, { keepDefaultValues: true });
    }
  }, [actionData?.values, form]);
  const { discardDialogProps, requestClose } = useDiscardGuard({
    isAudioDirty: false,
    isFormDirty: form.formState.isDirty,
    onClose: () => {
      form.reset(emptyProfessorValues);
      onOpenChange(false);
    },
  });

  const documentConflictDescription = useRosterDocumentConflictField({
    actionData: actionData?.status === "error" ? actionData : undefined,
    conflict: getCreateProfessorDocumentConflict(actionData),
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
            <DialogTitle>Nuevo profesor</DialogTitle>
            <DialogDescription>
              Ingresá los datos mínimos para cargarlo en la academia.
            </DialogDescription>
          </DialogHeader>

          {actionData?.status === "warning" ? (
            <RosterNameWarningDialog
              formId={formId}
              warning={actionData.warning}
            />
          ) : null}

          <form
            id={formId}
            method="post"
            onSubmit={createValidatedReactRouterSubmitHandler(form, submit, {
              method: "post",
            })}
            className="flex flex-col gap-5"
          >
            <input type="hidden" name="intent" value={createProfessorIntent} />
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

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting}
                onClick={requestClose}
              >
                Cancelar
              </Button>
              <SubmitButton
                disabled={!form.formState.isDirty}
                isPending={isSubmitting}
              />
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <DiscardChangesDialog {...discardDialogProps} />
    </>
  );
}

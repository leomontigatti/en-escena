import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import type { FetcherSubmitFunction } from "react-router";

import { SubmitButton } from "@/components/shared/action-buttons";
import {
  documentTypeEmptyLabel,
  documentTypeOptions,
} from "@/components/shared/document-type-options";
import { useRosterDocumentConflictField } from "@/components/shared/roster-document-conflict";
import { RosterNameWarningNotice } from "@/components/shared/roster-name-warning";
import { SelectField } from "@/components/shared/select-field";
import { TextInputField } from "@/components/shared/text-input-field";
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
  const form = useForm<CreateProfessorFormValues>({
    resolver: zodResolver(createProfessorSchema),
    defaultValues: actionData?.values ?? emptyProfessorValues,
  });

  useEffect(() => {
    form.reset(actionData?.values ?? emptyProfessorValues);
  }, [actionData?.values, form]);

  const documentConflictDescription = useRosterDocumentConflictField({
    actionData: actionData?.status === "error" ? actionData : undefined,
    conflict: getCreateProfessorDocumentConflict(actionData),
    name: "documentNumber",
    setError: form.setError,
  });

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent overlayClassName="backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle>Nuevo profesor</DialogTitle>
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

          {actionData?.status === "warning" ? (
            <RosterNameWarningNotice warning={actionData.warning} />
          ) : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isSubmitting}>
                Cancelar
              </Button>
            </DialogClose>
            {actionData?.status === "warning" ? null : (
              <SubmitButton isPending={isSubmitting} />
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

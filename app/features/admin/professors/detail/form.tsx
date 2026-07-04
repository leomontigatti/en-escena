import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";

import { DocumentTypeSelectField } from "@/components/shared/document-type-select-field";
import { ReadOnlyField } from "@/components/shared/read-only-field";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { TextInputField } from "@/components/shared/text-input-field";
import { TextareaField } from "@/components/shared/textarea-field";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { createValidatedNativeSubmitHandler } from "@/lib/shared/forms";

import {
  buildProfessorEditSchema,
  buildProfessorReasonSchema,
  type ProfessorEditFormValues,
  type ProfessorReasonFormValues,
} from "./shared";

type ProfessorEditFormReturn = UseFormReturn<
  ProfessorEditFormValues,
  unknown,
  ProfessorEditFormValues
>;

type ProfessorReasonFormReturn = UseFormReturn<
  ProfessorReasonFormValues,
  unknown,
  ProfessorReasonFormValues
>;

export function useProfessorEditForm({
  values,
}: {
  values: ProfessorEditFormValues;
}) {
  const form = useForm<
    ProfessorEditFormValues,
    unknown,
    ProfessorEditFormValues
  >({
    defaultValues: values,
    mode: "onSubmit",
    resolver: zodResolver(buildProfessorEditSchema()),
  });

  useEffect(() => {
    form.reset(values);
  }, [
    form,
    values.documentNumber,
    values.documentType,
    values.firstName,
    values.lastName,
  ]);

  return { form };
}

export function useProfessorReasonForm({
  correctionReasonRequired,
  values,
}: {
  correctionReasonRequired: boolean;
  values: ProfessorReasonFormValues;
}) {
  const form = useForm<
    ProfessorReasonFormValues,
    unknown,
    ProfessorReasonFormValues
  >({
    defaultValues: values,
    mode: "onSubmit",
    resolver: zodResolver(buildProfessorReasonSchema(correctionReasonRequired)),
  });

  useEffect(() => {
    form.reset(values);
  }, [form, values.correctionReason, values.statusIntent]);

  return { form, handleSubmit: createValidatedNativeSubmitHandler(form) };
}

export function ProfessorActionsMenu({
  active,
  onSelect,
}: {
  active: boolean;
  onSelect: (intent: "archive-professor" | "reactivate-professor") => void;
}) {
  return (
    <ResourceActionsMenu contentClassName="w-40">
      <DropdownMenuItem
        variant={active ? "destructive" : "default"}
        onSelect={(event) => {
          event.preventDefault();
          onSelect(active ? "archive-professor" : "reactivate-professor");
        }}
      >
        {active ? "Archivar" : "Reactivar"}
      </DropdownMenuItem>
    </ResourceActionsMenu>
  );
}

export function ProfessorTextField({
  form,
  label,
  name,
}: {
  form: ProfessorEditFormReturn;
  label: string;
  name: "documentNumber" | "firstName" | "lastName";
}) {
  return (
    <TextInputField
      autoComplete="off"
      control={form.control}
      label={label}
      name={name}
    />
  );
}

export function ProfessorDocumentTypeField({
  form,
}: {
  form: ProfessorEditFormReturn;
}) {
  return (
    <DocumentTypeSelectField
      control={form.control}
      name="documentType"
      contentProps={{ align: "start", position: "popper", side: "bottom" }}
    />
  );
}

export function ProfessorCorrectionReasonField({
  form,
  required,
}: {
  form: ProfessorReasonFormReturn;
  required: boolean;
}) {
  return (
    <>
      <TextareaField
        control={form.control}
        name="correctionReason"
        label="Motivo de corrección"
        description={
          required
            ? "Obligatorio entre 10 y 500 caracteres para este profesor."
            : "Opcional. Si lo completás, usá entre 10 y 500 caracteres."
        }
      />
      <input
        type="hidden"
        name="statusIntent"
        value={form.getValues("statusIntent") ?? ""}
      />
    </>
  );
}

export { ReadOnlyField };

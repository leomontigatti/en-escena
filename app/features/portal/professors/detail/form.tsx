import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import { useForm, type FieldPath, type UseFormReturn } from "react-hook-form";
import type { SubmitFunction } from "react-router";

import {
  documentTypeEmptyLabel,
  documentTypeOptions,
} from "@/components/shared/document-type-options";
import { SelectField } from "@/components/shared/select-field";
import { TextInputField } from "@/components/shared/text-input-field";
import { FieldGroup } from "@/components/ui/field";
import {
  createValidatedReactRouterSubmitHandler,
  useSavedFormValues,
} from "@/lib/shared/forms";
import {
  professorSchema,
  type ProfessorFormValues,
} from "@/features/portal/professors/detail/shared";

type ProfessorFormReturn = UseFormReturn<
  ProfessorFormValues,
  unknown,
  ProfessorFormValues
>;

/**
 * `savedValues` is what "changed" is measured against; `values` is what the
 * form shows, which after a refused save is what was typed and still reads as
 * changed ({@link useSavedFormValues}).
 */
export function usePortalProfessorForm({
  savedValues,
  submit,
  values,
}: {
  savedValues: ProfessorFormValues;
  submit: SubmitFunction;
  values: ProfessorFormValues;
}) {
  const form = useForm<ProfessorFormValues, unknown, ProfessorFormValues>({
    defaultValues: values,
    mode: "onSubmit",
    resolver: zodResolver(professorSchema),
  });
  useSavedFormValues(form, savedValues, values);

  return {
    discard: () => form.reset(savedValues),
    form,
    handleSubmit: createValidatedReactRouterSubmitHandler(form, submit, {
      method: "post",
    }),
  };
}

/**
 * The identification a professor is loaded with, the same on the page that
 * creates one and on the ficha that edits it.
 */
export function PortalProfessorIdentityFields({
  documentConflictDescription,
  form,
}: {
  documentConflictDescription?: ReactNode;
  form: ProfessorFormReturn;
}) {
  return (
    <FieldGroup className="grid gap-5 md:grid-cols-2">
      <ProfessorTextField form={form} label="Nombre" name="firstName" />
      <ProfessorTextField form={form} label="Apellido" name="lastName" />
      <SelectField
        allowEmpty
        control={form.control}
        emptyLabel={documentTypeEmptyLabel}
        label="Tipo de documento"
        name="documentType"
        options={documentTypeOptions}
        placeholder={documentTypeEmptyLabel}
      />
      <ProfessorTextField
        description={documentConflictDescription}
        form={form}
        label="Número de documento"
        name="documentNumber"
      />
    </FieldGroup>
  );
}

function ProfessorTextField({
  description,
  form,
  label,
  name,
}: {
  description?: ReactNode;
  form: ProfessorFormReturn;
  label: string;
  name: FieldPath<ProfessorFormValues>;
}) {
  const autoComplete = getProfessorFieldAutoComplete(name);

  return (
    <TextInputField
      autoComplete={autoComplete}
      control={form.control}
      description={description}
      label={label}
      name={name}
    />
  );
}

function getProfessorFieldAutoComplete(name: FieldPath<ProfessorFormValues>) {
  switch (name) {
    case "firstName":
      return "given-name";
    case "lastName":
      return "family-name";
    case "documentNumber":
    case "documentType":
      return "off";
  }
}

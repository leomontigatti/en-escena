import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useId } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";

import { DateOnlyField } from "@/components/shared/date-only-field";
import { TextInputField } from "@/components/shared/text-input-field";
import { createValidatedNativeSubmitHandler } from "@/lib/shared/forms";

import { buildDancerUpdateSchema, type DancerEditFormValues } from "./shared";

type DancerEditFormReturn = UseFormReturn<
  DancerEditFormValues,
  unknown,
  DancerEditFormValues
>;

export function useDancerEditForm({
  values,
}: {
  values: DancerEditFormValues;
}) {
  const form = useForm<DancerEditFormValues, unknown, DancerEditFormValues>({
    defaultValues: values,
    mode: "onSubmit",
    resolver: zodResolver(buildDancerUpdateSchema()),
  });

  useEffect(() => {
    form.reset(values);
  }, [
    form,
    values.birthDate,
    values.documentBackImageStorageKey,
    values.documentFrontImageStorageKey,
    values.documentNumber,
    values.documentType,
    values.firstName,
    values.lastName,
  ]);

  return { form, handleSubmit: createValidatedNativeSubmitHandler(form) };
}

export function DancerTextField({
  form,
  label,
  name,
}: {
  form: DancerEditFormReturn;
  label: string;
  name:
    | "documentBackImageStorageKey"
    | "documentFrontImageStorageKey"
    | "documentNumber"
    | "firstName"
    | "lastName";
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

export function DancerBirthDateField({
  className,
  form,
}: {
  className?: string;
  form: DancerEditFormReturn;
}) {
  const id = useId();

  return (
    <DateOnlyField
      control={form.control}
      name="birthDate"
      className={className}
      id={id}
      label="Fecha de nacimiento"
    />
  );
}

export type DancerEditFormController = ReturnType<typeof useDancerEditForm>;

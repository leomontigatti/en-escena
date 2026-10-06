import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type UseFormReturn } from "react-hook-form";

import { BirthDateField } from "@/components/shared/birth-date-field";
import { TextInputField } from "@/components/shared/text-input-field";

import { useSavedFormValues } from "@/lib/shared/forms";

import { buildDancerUpdateSchema, type DancerEditFormValues } from "./shared";

type DancerEditFormReturn = UseFormReturn<
  DancerEditFormValues,
  unknown,
  DancerEditFormValues
>;

/**
 * The form is measured against what is saved, not against what the server last
 * sent back. A refused save refills the fields with what was typed, and those
 * values go in as the current ones with the saved values kept as the defaults:
 * the form still reads as changed, so `Guardar` stays on and the guard keeps
 * asking. A successful save revalidates the loader, and the new saved values
 * reset the form to clean.
 */
export function useDancerEditForm({
  eventStartDate,
  savedValues,
  submittedValues,
}: {
  eventStartDate: string | null;
  savedValues: DancerEditFormValues;
  submittedValues: DancerEditFormValues | null;
}) {
  const form = useForm<DancerEditFormValues, unknown, DancerEditFormValues>({
    // The effect below corrects the defaults; this only keeps the first render
    // (and a server render) showing what was typed.
    defaultValues: submittedValues ?? savedValues,
    mode: "onSubmit",
    resolver: zodResolver(buildDancerUpdateSchema(eventStartDate)),
  });
  useSavedFormValues(form, savedValues, submittedValues);

  return {
    discard: () => form.reset(savedValues),
    eventStartDate,
    form,
    hasChanges: form.formState.isDirty,
  };
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
  return (
    <BirthDateField
      control={form.control}
      name="birthDate"
      className={className}
      label="Fecha de nacimiento"
    />
  );
}

export type DancerEditFormController = ReturnType<typeof useDancerEditForm>;

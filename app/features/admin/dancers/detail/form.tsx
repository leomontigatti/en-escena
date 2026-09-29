import { zodResolver } from "@hookform/resolvers/zod";
import { useId, type ReactNode } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";

import { DateOnlyField } from "@/components/shared/date-only-field";
import { TextInputField } from "@/components/shared/text-input-field";
import { getBirthDatePickerBounds } from "@/lib/dancers/birth-date";

import { useRosterDocumentConflictField } from "@/components/shared/roster-document-conflict";
import { useSavedFormValues } from "@/lib/shared/forms";

import {
  buildDancerUpdateSchema,
  getDancerDocumentConflict,
  type DancerActionError,
  type DancerEditFormValues,
} from "./shared";

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
  actionData,
  eventStartDate,
  savedValues,
  submittedValues,
}: {
  actionData?: DancerActionError;
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

  const documentConflictDescription = useRosterDocumentConflictField({
    actionData,
    conflict: getDancerDocumentConflict(actionData),
    name: "documentNumber",
    setError: form.setError,
  });

  return {
    discard: () => form.reset(savedValues),
    documentConflictDescription,
    eventStartDate,
    form,
    hasChanges: form.formState.isDirty,
  };
}

export function DancerTextField({
  description,
  form,
  label,
  name,
}: {
  description?: ReactNode;
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
      description={description}
      label={label}
      name={name}
    />
  );
}

export function DancerBirthDateField({
  className,
  eventStartDate,
  form,
}: {
  className?: string;
  eventStartDate: string | null;
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
      calendarBounds={getBirthDatePickerBounds(eventStartDate)}
    />
  );
}

export type DancerEditFormController = ReturnType<typeof useDancerEditForm>;

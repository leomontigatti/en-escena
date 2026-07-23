import { zodResolver } from "@hookform/resolvers/zod";
import { ExternalLink, Lock } from "lucide-react";
import { useEffect, useId } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";

import { DateOnlyField } from "@/components/shared/date-only-field";
import { TextInputField } from "@/components/shared/text-input-field";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
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

export function ReadOnlyDocumentImageField({
  label,
  name,
  storageKey,
  url,
}: {
  label: string;
  name?: "documentBackImageStorageKey" | "documentFrontImageStorageKey";
  storageKey: string | null;
  url: string | null;
}) {
  const id = useId();
  const hasImage = Boolean(storageKey);

  return (
    <Field data-disabled>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <FieldContent>
        {name ? (
          <input type="hidden" name={name} value={storageKey ?? ""} />
        ) : null}
        <div className="relative">
          <div
            id={id}
            className="flex h-8 w-full min-w-0 items-center rounded-lg border border-input bg-input/50 px-2.5 py-1 pr-9 text-base opacity-50 md:text-sm"
          >
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-w-0 items-center gap-1.5 text-primary underline-offset-4 hover:underline"
              >
                <ExternalLink aria-hidden="true" className="size-3.5" />
                <span className="truncate">Abrir imagen</span>
              </a>
            ) : (
              <span className="truncate">
                {hasImage ? "Imagen no disponible" : "Sin imagen"}
              </span>
            )}
          </div>
          <Lock
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-3 size-3 -translate-y-1/2 text-muted-foreground"
          />
        </div>
      </FieldContent>
    </Field>
  );
}

export type DancerEditFormController = ReturnType<typeof useDancerEditForm>;

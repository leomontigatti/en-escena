import { zodResolver } from "@hookform/resolvers/zod";
import { ExternalLink, Lock } from "lucide-react";
import { useEffect, useId } from "react";
import {
  Controller,
  type FieldPath,
  useForm,
  type UseFormReturn,
} from "react-hook-form";

import { DateOnlyField } from "@/components/shared/date-only-field";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type {
  AdministrativeDancerFieldErrors,
  AdministrativeDancerStatusInput,
} from "@/lib/admin/dancers/dancers.server";
import {
  createValidatedNativeSubmitHandler,
  useApplyServerFieldErrors,
} from "@/lib/shared/forms";

import {
  buildDancerStatusSchema,
  buildDancerUpdateSchema,
  emptyDancerFieldErrors,
  formatDateOnlyLabel,
  noDocumentTypeSelectValue,
  type DancerDetailLoaderData,
  type DancerEditFormValues,
} from "./shared";

type DancerEditFormReturn = UseFormReturn<
  DancerEditFormValues,
  unknown,
  DancerEditFormValues
>;

type DancerStatusFormReturn = UseFormReturn<
  AdministrativeDancerStatusInput,
  unknown,
  AdministrativeDancerStatusInput
>;

export function useDancerEditForm({
  correctionReasonRequired,
  fieldErrors = emptyDancerFieldErrors,
  values,
}: {
  correctionReasonRequired: boolean;
  fieldErrors?: AdministrativeDancerFieldErrors;
  values: DancerEditFormValues;
}) {
  const form = useForm<DancerEditFormValues, unknown, DancerEditFormValues>({
    defaultValues: values,
    mode: "onSubmit",
    resolver: zodResolver(buildDancerUpdateSchema(correctionReasonRequired)),
  });

  useEffect(() => {
    form.reset(values);
  }, [
    form,
    values.birthDate,
    values.correctionReason,
    values.documentBackImageStorageKey,
    values.documentFrontImageStorageKey,
    values.documentNumber,
    values.documentType,
    values.firstName,
    values.lastName,
  ]);

  useApplyServerFieldErrors(form, fieldErrors);

  return { form, handleSubmit: createValidatedNativeSubmitHandler(form) };
}

export function useDancerStatusForm({
  correctionReasonRequired,
  fieldErrors = emptyDancerFieldErrors,
  values,
}: {
  correctionReasonRequired: boolean;
  fieldErrors?: AdministrativeDancerFieldErrors;
  values: AdministrativeDancerStatusInput;
}) {
  const form = useForm<
    AdministrativeDancerStatusInput,
    unknown,
    AdministrativeDancerStatusInput
  >({
    defaultValues: values,
    mode: "onSubmit",
    resolver: zodResolver(buildDancerStatusSchema(correctionReasonRequired)),
  });

  useEffect(() => {
    form.reset(values);
  }, [form, values.correctionReason]);

  useApplyServerFieldErrors(form, fieldErrors);

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
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <Controller
      control={form.control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.error ? true : undefined}>
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          <FieldContent>
            <Input
              id={id}
              aria-invalid={fieldState.error ? true : undefined}
              aria-describedby={fieldState.error ? errorId : undefined}
              autoComplete="off"
              {...field}
            />
            <FieldError id={errorId}>{fieldState.error?.message}</FieldError>
          </FieldContent>
        </Field>
      )}
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
    <Controller
      control={form.control}
      name="birthDate"
      render={({ field, fieldState }) => (
        <DateOnlyField
          className={className}
          id={id}
          label="Fecha de nacimiento"
          name={field.name}
          defaultValue={field.value}
          error={fieldState.error?.message}
          onBlur={field.onBlur}
          onValueChange={field.onChange}
          value={field.value}
        />
      )}
    />
  );
}

export function DancerDocumentTypeField({
  form,
}: {
  form: DancerEditFormReturn;
}) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <Controller
      control={form.control}
      name="documentType"
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.error ? true : undefined}>
          <FieldLabel htmlFor={id}>Tipo de documento</FieldLabel>
          <FieldContent>
            <Select
              value={field.value || noDocumentTypeSelectValue}
              onValueChange={(value) => {
                field.onChange(
                  value === noDocumentTypeSelectValue ? "" : value,
                );
              }}
            >
              <input type="hidden" name={field.name} value={field.value} />
              <SelectTrigger
                id={id}
                aria-invalid={fieldState.error ? true : undefined}
                aria-describedby={fieldState.error ? errorId : undefined}
                className="w-full"
              >
                <SelectValue placeholder="Sin documento" />
              </SelectTrigger>
              <SelectContent align="start" position="popper" side="bottom">
                <SelectItem value={noDocumentTypeSelectValue}>
                  Sin documento
                </SelectItem>
                <SelectItem value="dni">DNI</SelectItem>
                <SelectItem value="passport">Pasaporte</SelectItem>
                <SelectItem value="other">Otro</SelectItem>
              </SelectContent>
            </Select>
            <FieldError id={errorId}>{fieldState.error?.message}</FieldError>
          </FieldContent>
        </Field>
      )}
    />
  );
}

export function DancerCorrectionReasonField<
  TFieldValues extends AdministrativeDancerStatusInput,
>({
  form,
  formId,
  required,
}: {
  form: UseFormReturn<TFieldValues, unknown, TFieldValues>;
  formId?: string;
  required: boolean;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <Controller
      control={form.control}
      name={"correctionReason" as FieldPath<TFieldValues>}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.error ? true : undefined}>
          <FieldLabel htmlFor={id}>Motivo de corrección</FieldLabel>
          <FieldContent>
            <Textarea
              id={id}
              aria-invalid={fieldState.error ? true : undefined}
              aria-describedby={
                fieldState.error ? `${hintId} ${errorId}` : hintId
              }
              form={formId}
              {...field}
            />
            <FieldDescription id={hintId}>
              {required
                ? "Obligatorio entre 10 y 500 caracteres para este Bailarín."
                : "Opcional. Si lo completás, usá entre 10 y 500 caracteres."}
            </FieldDescription>
            <FieldError id={errorId}>{fieldState.error?.message}</FieldError>
          </FieldContent>
        </Field>
      )}
    />
  );
}

export function ReadOnlyField({
  className,
  displayValue,
  hiddenValue,
  label,
  name,
  value,
}: {
  className?: string;
  displayValue?: string;
  hiddenValue?: string;
  label: string;
  name?: string;
  value: string;
}) {
  const id = useId();

  return (
    <Field className={className} data-disabled>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <FieldContent>
        {name ? (
          <input type="hidden" name={name} value={hiddenValue ?? value} />
        ) : null}
        <div className="relative">
          <Input
            id={id}
            value={displayValue ?? value}
            disabled
            readOnly
            className="pr-9"
          />
          <Lock
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-3 size-3 -translate-y-1/2 text-muted-foreground"
          />
        </div>
      </FieldContent>
    </Field>
  );
}

export function ReadOnlyDateField({
  className,
  value,
}: {
  className?: string;
  value: string;
}) {
  return (
    <ReadOnlyField
      className={className}
      label="Fecha de nacimiento"
      value={value}
      displayValue={formatDateOnlyLabel(value)}
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
export type DancerStatusFormController = ReturnType<typeof useDancerStatusForm>;
export type DancerDetailDocumentUrls =
  DancerDetailLoaderData["documentImageUrls"];

import { zodResolver } from "@hookform/resolvers/zod";
import { Lock } from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";
import { Controller, useForm, type UseFormReturn } from "react-hook-form";

import { DateOnlyField } from "@/components/shared/date-only-field";
import { FileUploadField } from "@/components/shared/file-upload-field";
import {
  Field,
  FieldContent,
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
import {
  createValidatedReactRouterSubmitHandler,
  type ReactRouterFormSubmit,
  useApplyServerFieldErrors,
} from "@/lib/shared/forms";

import {
  dancerDocumentImageAccept,
  dancerDocumentImageAllowedMimeTypes,
  dancerDocumentImageMaxFileSizeBytes,
  dancerSchema,
  emptyPortalDancerFieldErrors,
  getPortalDancerFieldAutoComplete,
  noDocumentTypeSelectValue,
  type PortalDancerDetailActionData,
  type PortalDancerDetailLoaderData,
  type PortalDancerFormValues,
} from "./dancer-detail.shared";

type PortalDancerFormReturn = UseFormReturn<
  PortalDancerFormValues,
  unknown,
  PortalDancerFormValues
>;

type PortalDancerTextFieldName =
  | "documentBackImageStorageKey"
  | "documentFrontImageStorageKey"
  | "documentNumber"
  | "firstName"
  | "lastName";

export function usePortalDancerForm({
  fieldErrors = emptyPortalDancerFieldErrors,
  submit,
  values,
}: {
  fieldErrors?: PortalDancerDetailActionData["fieldErrors"];
  submit: ReactRouterFormSubmit;
  values: PortalDancerFormValues;
}) {
  const form = useForm<PortalDancerFormValues, unknown, PortalDancerFormValues>(
    {
      defaultValues: values,
      mode: "onSubmit",
      resolver: zodResolver(dancerSchema),
    },
  );

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

  useApplyServerFieldErrors(form, fieldErrors);

  return {
    form,
    handleSubmit: createValidatedReactRouterSubmitHandler(form, submit, {
      encType: "multipart/form-data",
      method: "post",
    }),
  };
}

export function ReadonlyLockedFormField({
  displayValue,
  label,
  name,
  value,
}: {
  displayValue?: string;
  label: string;
  name: string;
  value: string;
}) {
  const id = useId();

  return (
    <Field data-disabled>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <FieldContent>
        <input type="hidden" name={name} value={value} />
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

export function PortalDancerTextField({
  error,
  form,
  label,
  name,
}: {
  error?: string;
  form: PortalDancerFormReturn;
  label: string;
  name: PortalDancerTextFieldName;
}) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <Controller
      control={form.control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.error || error ? true : undefined}>
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          <FieldContent>
            <Input
              id={id}
              autoComplete={getPortalDancerFieldAutoComplete(name)}
              aria-invalid={fieldState.error || error ? true : undefined}
              aria-describedby={fieldState.error || error ? errorId : undefined}
              {...field}
            />
            <FieldError id={errorId}>
              {fieldState.error?.message ?? error}
            </FieldError>
          </FieldContent>
        </Field>
      )}
    />
  );
}

export function PortalDancerBirthDateField({
  error,
  form,
}: {
  error?: string;
  form: PortalDancerFormReturn;
}) {
  const id = useId();

  return (
    <Controller
      control={form.control}
      name="birthDate"
      render={({ field, fieldState }) => (
        <DateOnlyField
          id={id}
          label="Fecha de nacimiento"
          name={field.name}
          defaultValue={field.value ?? ""}
          value={field.value ?? ""}
          onBlur={field.onBlur}
          onValueChange={field.onChange}
          error={fieldState.error?.message ?? error}
          buttonClassName="mt-0 h-8 w-full font-normal"
          endMonth={new Date()}
          startMonth={new Date(1900, 0)}
        />
      )}
    />
  );
}

export function PortalDancerDocumentTypeField({
  error,
  form,
}: {
  error?: string;
  form: PortalDancerFormReturn;
}) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <Controller
      control={form.control}
      name="documentType"
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.error || error ? true : undefined}>
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
                aria-invalid={fieldState.error || error ? true : undefined}
                aria-describedby={
                  fieldState.error || error ? errorId : undefined
                }
                className="h-10 w-full"
              >
                <SelectValue placeholder="Sin documento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={noDocumentTypeSelectValue}>
                  Sin documento
                </SelectItem>
                <SelectItem value="dni">DNI</SelectItem>
                <SelectItem value="passport">Pasaporte</SelectItem>
                <SelectItem value="other">Otro</SelectItem>
              </SelectContent>
            </Select>
            <FieldError id={errorId}>
              {fieldState.error?.message ?? error}
            </FieldError>
          </FieldContent>
        </Field>
      )}
    />
  );
}

export function PortalDancerDocumentImageFields({
  form,
  formValues,
  imageUrls,
}: {
  form: PortalDancerFormReturn;
  formValues: PortalDancerFormValues;
  imageUrls: PortalDancerDetailLoaderData["documentImageUrls"];
}) {
  const frontImageId = useId();
  const backImageId = useId();
  const [frontImageHasError, setFrontImageHasError] = useState(false);
  const [backImageHasError, setBackImageHasError] = useState(false);
  const handleFrontImageValidationErrorChange = useCallback(
    (hasError: boolean) => {
      setFrontImageHasError(hasError);
    },
    [],
  );
  const handleBackImageValidationErrorChange = useCallback(
    (hasError: boolean) => {
      setBackImageHasError(hasError);
    },
    [],
  );
  const handleFrontImageStorageKeyChange = useCallback(
    (storageKey: string) => {
      form.setValue("documentFrontImageStorageKey", storageKey, {
        shouldDirty: true,
      });
    },
    [form],
  );
  const handleBackImageStorageKeyChange = useCallback(
    (storageKey: string) => {
      form.setValue("documentBackImageStorageKey", storageKey, {
        shouldDirty: true,
      });
    },
    [form],
  );

  return (
    <>
      <Field data-invalid={frontImageHasError ? true : undefined}>
        <FieldLabel htmlFor={frontImageId}>Frente del documento</FieldLabel>
        <FieldContent>
          <FileUploadField
            id={frontImageId}
            name="documentFrontImage"
            existingPreviewUrl={imageUrls.front}
            storageKeyInputName="documentFrontImageStorageKey"
            storageKeyValue={formValues.documentFrontImageStorageKey}
            label="Arrastrá o hacé click"
            helperText="JPG, PNG o WEBP - max 10 MB"
            accept={dancerDocumentImageAccept}
            allowedMimeTypes={dancerDocumentImageAllowedMimeTypes}
            maxFileSizeBytes={dancerDocumentImageMaxFileSizeBytes}
            onStorageKeyChange={handleFrontImageStorageKeyChange}
            onValidationErrorChange={handleFrontImageValidationErrorChange}
          />
        </FieldContent>
      </Field>
      <Field data-invalid={backImageHasError ? true : undefined}>
        <FieldLabel htmlFor={backImageId}>Dorso del documento</FieldLabel>
        <FieldContent>
          <FileUploadField
            id={backImageId}
            name="documentBackImage"
            existingPreviewUrl={imageUrls.back}
            storageKeyInputName="documentBackImageStorageKey"
            storageKeyValue={formValues.documentBackImageStorageKey}
            label="Arrastrá o hacé click"
            helperText="JPG, PNG o WEBP - max 10 MB"
            accept={dancerDocumentImageAccept}
            allowedMimeTypes={dancerDocumentImageAllowedMimeTypes}
            maxFileSizeBytes={dancerDocumentImageMaxFileSizeBytes}
            onStorageKeyChange={handleBackImageStorageKeyChange}
            onValidationErrorChange={handleBackImageValidationErrorChange}
          />
        </FieldContent>
      </Field>
    </>
  );
}

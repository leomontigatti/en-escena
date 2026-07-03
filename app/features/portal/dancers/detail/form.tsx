import { zodResolver } from "@hookform/resolvers/zod";
import { Lock } from "lucide-react";
import { useEffect, useId } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";

import { DateOnlyField } from "@/components/shared/date-only-field";
import { DocumentTypeSelectField } from "@/components/shared/document-type-select-field";
import { FileUploadField } from "@/components/shared/file-upload-field";
import { TextInputField } from "@/components/shared/text-input-field";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  createValidatedReactRouterSubmitHandler,
  type ReactRouterFormSubmit,
} from "@/lib/shared/forms";

import {
  dancerDocumentImageAccept,
  dancerDocumentImageAllowedMimeTypes,
  dancerDocumentImageMaxFileSizeBytes,
  dancerSchema,
  getPortalDancerFieldAutoComplete,
  type PortalDancerDetailLoaderData,
  type PortalDancerFormValues,
} from "./shared";

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
  submit,
  values,
}: {
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
  form,
  label,
  name,
}: {
  form: PortalDancerFormReturn;
  label: string;
  name: PortalDancerTextFieldName;
}) {
  return (
    <TextInputField
      autoComplete={getPortalDancerFieldAutoComplete(name)}
      control={form.control}
      label={label}
      name={name}
    />
  );
}

export function PortalDancerBirthDateField({
  form,
}: {
  form: PortalDancerFormReturn;
}) {
  const id = useId();

  return (
    <DateOnlyField
      control={form.control}
      name="birthDate"
      id={id}
      label="Fecha de nacimiento"
      buttonClassName="mt-0 h-8 w-full font-normal"
      endMonth={new Date()}
      startMonth={new Date(1900, 0)}
    />
  );
}

export function PortalDancerDocumentTypeField({
  form,
}: {
  form: PortalDancerFormReturn;
}) {
  return <DocumentTypeSelectField control={form.control} name="documentType" />;
}

export function PortalDancerDocumentImageFields({
  form,
  imageUrls,
}: {
  form: PortalDancerFormReturn;
  imageUrls: PortalDancerDetailLoaderData["documentImageUrls"];
}) {
  return (
    <>
      <FileUploadField
        control={form.control}
        name="documentFrontImageStorageKey"
        fileInputName="documentFrontImage"
        fieldLabel="Frente del documento"
        existingPreviewUrl={imageUrls.front}
        label="Arrastrá o hacé click"
        helperText="JPG, PNG o WEBP - max 10 MB"
        accept={dancerDocumentImageAccept}
        allowedMimeTypes={dancerDocumentImageAllowedMimeTypes}
        maxFileSizeBytes={dancerDocumentImageMaxFileSizeBytes}
      />
      <FileUploadField
        control={form.control}
        name="documentBackImageStorageKey"
        fileInputName="documentBackImage"
        fieldLabel="Dorso del documento"
        existingPreviewUrl={imageUrls.back}
        label="Arrastrá o hacé click"
        helperText="JPG, PNG o WEBP - max 10 MB"
        accept={dancerDocumentImageAccept}
        allowedMimeTypes={dancerDocumentImageAllowedMimeTypes}
        maxFileSizeBytes={dancerDocumentImageMaxFileSizeBytes}
      />
    </>
  );
}

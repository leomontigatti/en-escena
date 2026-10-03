import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";
import type { SubmitFunction } from "react-router";

import { BirthDateField } from "@/components/shared/birth-date-field";
import { FileUploadField } from "@/components/shared/file-upload-field";
import { TextInputField } from "@/components/shared/text-input-field";
import {
  createValidatedReactRouterSubmitHandler,
  useSavedFormValues,
} from "@/lib/shared/forms";

import { getAssetUploadFieldProps } from "@/lib/storage/asset-kinds";

import {
  buildPortalDancerSchema,
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

/**
 * `savedValues` is what the dancer holds and what "changed" is measured
 * against; `values` is what the form shows, which after a refused save is what
 * was typed, which still reads as changed ({@link useSavedFormValues}).
 */
export function usePortalDancerForm({
  eventStartDate,
  savedValues,
  submit,
  values,
}: {
  eventStartDate: string | null;
  savedValues: PortalDancerFormValues;
  submit: SubmitFunction;
  values: PortalDancerFormValues;
}) {
  const form = useForm<PortalDancerFormValues, unknown, PortalDancerFormValues>(
    {
      defaultValues: values,
      mode: "onSubmit",
      resolver: zodResolver(buildPortalDancerSchema(eventStartDate)),
    },
  );
  useSavedFormValues(form, savedValues, values);

  return {
    discard: () => form.reset(savedValues),
    form,
    handleSubmit: createValidatedReactRouterSubmitHandler(form, submit, {
      encType: "multipart/form-data",
      method: "post",
    }),
  };
}

export function PortalDancerTextField({
  description,
  form,
  label,
  name,
}: {
  description?: ReactNode;
  form: PortalDancerFormReturn;
  label: string;
  name: PortalDancerTextFieldName;
}) {
  return (
    <TextInputField
      autoComplete={getPortalDancerFieldAutoComplete(name)}
      control={form.control}
      description={description}
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
  return (
    <BirthDateField
      control={form.control}
      name="birthDate"
      label="Fecha de nacimiento"
    />
  );
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
        fieldLabel="Imagen frente del documento"
        existingPreviewUrl={imageUrls.front}
        label="Arrastrá o hacé click"
        offersCamera
        {...getAssetUploadFieldProps("dancerDocumentImage")}
      />
      <FileUploadField
        control={form.control}
        name="documentBackImageStorageKey"
        fileInputName="documentBackImage"
        fieldLabel="Imagen dorso del documento"
        existingPreviewUrl={imageUrls.back}
        label="Arrastrá o hacé click"
        offersCamera
        {...getAssetUploadFieldProps("dancerDocumentImage")}
      />
    </>
  );
}

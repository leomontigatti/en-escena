import { zodResolver } from "@hookform/resolvers/zod";
import { Fragment, useEffect, useState, type ReactNode } from "react";
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

type DocumentImageSide = "back" | "front";

const noPickedDocumentImages: Record<DocumentImageSide, boolean> = {
  back: false,
  front: false,
};

type PortalDancerDocumentImagesState = {
  /** Changes when the photo fields have to let go of what they hold. */
  fieldsKey: string;
  onPickedChange: (side: DocumentImageSide, isPicked: boolean) => void;
};

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
 *
 * A picked photo lives in its file input, not in the form's values, so
 * `isDirty` cannot see it: `hasChanges` counts it, and `discard` and a save
 * that stores new photos remount the photo fields, so their file inputs let
 * go of what they held and a stale photo does not ride along on the next save.
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

  const [pickedDocumentImages, setPickedDocumentImages] = useState(
    noPickedDocumentImages,
  );
  const [discardCount, setDiscardCount] = useState(0);
  const savedDocumentImagesKey = `${savedValues.documentFrontImageStorageKey}:${savedValues.documentBackImageStorageKey}`;

  useEffect(() => {
    setPickedDocumentImages(noPickedDocumentImages);
  }, [savedDocumentImagesKey]);

  return {
    discard: () => {
      form.reset(savedValues);
      setPickedDocumentImages(noPickedDocumentImages);
      setDiscardCount((count) => count + 1);
    },
    documentImages: {
      fieldsKey: `${savedDocumentImagesKey}:${discardCount}`,
      onPickedChange: (side, isPicked) => {
        setPickedDocumentImages((picked) => ({ ...picked, [side]: isPicked }));
      },
    } satisfies PortalDancerDocumentImagesState,
    form,
    hasChanges:
      form.formState.isDirty ||
      pickedDocumentImages.front ||
      pickedDocumentImages.back,
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
  disabled = false,
  documentImages,
  form,
  imageUrls,
}: {
  disabled?: boolean;
  documentImages: PortalDancerDocumentImagesState;
  form: PortalDancerFormReturn;
  imageUrls: PortalDancerDetailLoaderData["documentImageUrls"];
}) {
  return (
    <Fragment key={documentImages.fieldsKey}>
      <FileUploadField
        control={form.control}
        disabled={disabled}
        name="documentFrontImageStorageKey"
        fileInputName="documentFrontImage"
        fieldLabel="Imagen frente del documento"
        existingPreviewUrl={imageUrls.front}
        onSelectedFileChange={(file) =>
          documentImages.onPickedChange("front", file !== null)
        }
        label="Arrastrá o hacé click"
        offersCamera
        {...getAssetUploadFieldProps("dancerDocumentImage")}
      />
      <FileUploadField
        control={form.control}
        disabled={disabled}
        name="documentBackImageStorageKey"
        fileInputName="documentBackImage"
        fieldLabel="Imagen dorso del documento"
        existingPreviewUrl={imageUrls.back}
        onSelectedFileChange={(file) =>
          documentImages.onPickedChange("back", file !== null)
        }
        label="Arrastrá o hacé click"
        offersCamera
        {...getAssetUploadFieldProps("dancerDocumentImage")}
      />
    </Fragment>
  );
}

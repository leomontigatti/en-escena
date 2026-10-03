import { useState, type FormEvent } from "react";
import { useNavigation, useSubmit } from "react-router";

import { PortalPageHeader } from "@/components/portal/ui";
import {
  documentTypeEmptyLabel,
  documentTypeOptions,
} from "@/components/shared/document-type-options";
import { FormActions } from "@/components/shared/form-actions";
import { useRosterDocumentConflictField } from "@/components/shared/roster-document-conflict";
import { RosterNameWarningDialog } from "@/components/shared/roster-name-warning";
import { SelectField } from "@/components/shared/select-field";
import { Card, CardContent } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { useLastRefusedValues } from "@/lib/shared/forms";
import type { UnexpectedActionError } from "@/lib/shared/recoverable-client-action";
import { useServerActionToast } from "@/lib/shared/toasts";
import {
  PortalDancerBirthDateField,
  PortalDancerDocumentImageFields,
  PortalDancerTextField,
  usePortalDancerForm,
} from "@/features/portal/dancers/detail/form";
import { getPortalDancerDocumentConflict } from "@/features/portal/dancers/detail/shared";

import { emptyDancerValues, type CreateDancerActionData } from "./shared";

const createDancerFormId = "portal-bailarin-nuevo-form";
const noDocumentImages = { back: null, front: null };

/**
 * The detail's identification fields on a page of their own, photos included.
 * A refusal comes back to the page with what was typed, and the picked photos
 * stay in their inputs because the page never unmounts; a save leaves for the
 * list.
 */
export function CreateDancerPage({
  actionData,
  eventStartDate,
}: {
  actionData?: CreateDancerActionData | UnexpectedActionError;
  eventStartDate: string | null;
}) {
  const refusal =
    actionData !== undefined && "values" in actionData ? actionData : undefined;
  const refusedValues = useLastRefusedValues(refusal?.values);
  const submit = useSubmit();
  const navigation = useNavigation();
  const form = usePortalDancerForm({
    eventStartDate,
    savedValues: emptyDancerValues,
    submit,
    values: refusedValues ?? emptyDancerValues,
  });
  const documentConflictDescription = useRosterDocumentConflictField({
    actionData: refusal,
    conflict: getPortalDancerDocumentConflict(refusal),
    name: "documentNumber",
    setError: form.form.setError,
  });
  // Still pending while a save redirects to the list, so the leave guard
  // does not ask about the form it just saved.
  const isSubmitting =
    navigation.state !== "idle" && navigation.formData !== undefined;
  // A picked photo lives in its file input, not in the form's values, so it
  // counts as a change here: it keeps `Guardar` on and the leave guard
  // asking, and `Descartar cambios` remounts the photo fields to drop it.
  const [hasPickedPhoto, setHasPickedPhoto] = useState(false);
  const [photoFieldsKey, setPhotoFieldsKey] = useState(0);

  useServerActionToast(actionData?.status === "error" ? actionData : null, {
    toastId: "portal-bailarin-nuevo:error",
  });

  return (
    <section
      aria-labelledby="nuevo-bailarin-title"
      className="flex flex-1 flex-col gap-6"
    >
      <PortalPageHeader
        titleId="nuevo-bailarin-title"
        title="Nuevo bailarín"
        description="Cargá sus datos y, si las tenés a mano, las fotos del documento."
      />

      <Card className="overflow-clip">
        <CardContent>
          <form
            id={createDancerFormId}
            method="post"
            encType="multipart/form-data"
            noValidate
            onSubmit={form.handleSubmit}
            onChange={(event: FormEvent<HTMLFormElement>) => {
              const target = event.target;

              if (
                target instanceof HTMLInputElement &&
                target.type === "file" &&
                (target.files?.length ?? 0) > 0
              ) {
                setHasPickedPhoto(true);
              }
            }}
          >
            <FieldGroup className="grid gap-5 md:grid-cols-2">
              <PortalDancerTextField
                form={form.form}
                label="Nombre"
                name="firstName"
              />
              <PortalDancerTextField
                form={form.form}
                label="Apellido"
                name="lastName"
              />
              <PortalDancerBirthDateField form={form.form} />
              <div className="hidden md:block" aria-hidden="true" />
              <SelectField
                allowEmpty
                control={form.form.control}
                emptyLabel={documentTypeEmptyLabel}
                label="Tipo de documento"
                name="documentType"
                options={documentTypeOptions}
                placeholder={documentTypeEmptyLabel}
              />
              <PortalDancerTextField
                description={documentConflictDescription}
                form={form.form}
                label="Número de documento"
                name="documentNumber"
              />
              <PortalDancerDocumentImageFields
                key={photoFieldsKey}
                form={form.form}
                imageUrls={noDocumentImages}
              />
            </FieldGroup>
          </form>
        </CardContent>
        <FormActions
          backTo="/portal/bailarines"
          form={createDancerFormId}
          hasChanges={form.form.formState.isDirty || hasPickedPhoto}
          isPending={isSubmitting}
          onDiscard={() => {
            form.discard();
            setHasPickedPhoto(false);
            setPhotoFieldsKey((key) => key + 1);
          }}
        />
      </Card>

      {refusal?.status === "warning" ? (
        <RosterNameWarningDialog
          formId={createDancerFormId}
          isPending={isSubmitting}
          warning={refusal.warning}
        />
      ) : null}
    </section>
  );
}

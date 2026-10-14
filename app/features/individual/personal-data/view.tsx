import { zodResolver } from "@hookform/resolvers/zod";
import { Info } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigation, useSubmit } from "react-router";

import { PortalPageHeader } from "@/components/portal/ui";
import { AlertStack } from "@/components/shared/alert-stack";
import { FileUploadField } from "@/components/shared/file-upload-field";
import { FormActions } from "@/components/shared/form-actions";
import { IndividualLinkStateBadge } from "@/components/shared/individual-link-state-badge";
import { ReadOnlyField } from "@/components/shared/read-only-field";
import { SelectField } from "@/components/shared/select-field";
import { TextInputField } from "@/components/shared/text-input-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import type { loadIndividualPersonalData } from "@/features/individual/personal-data/server";
import { INDIVIDUAL_AREA_PATH } from "@/lib/auth/user-role.shared";
import type { IndividualLinkState } from "@/lib/individuals/link-state";
import { documentTypeOptions } from "@/lib/roster/identity-document";
import { argentinePhonePlaceholder } from "@/lib/shared/argentine-phone";
import {
  createValidatedRouteSubmitHandler,
  useSavedFormValues,
} from "@/lib/shared/forms";
import { useServerActionToast } from "@/lib/shared/toasts";
import { getAssetUploadFieldProps } from "@/lib/storage/asset-kinds";

import {
  documentPhotoFileField,
  documentPhotoStorageKeyField,
  misDatosFormSchema,
  type IndividualPersonalDataActionData,
  type MisDatosFormValues,
} from "./shared";

const personalDataFormId = "particular-mis-datos-form";

type LoaderData = Awaited<ReturnType<typeof loadIndividualPersonalData>>;

/** Its own result, or the generic failure `recoverableClientAction` returns. */
type PersonalDataActionData =
  IndividualPersonalDataActionData | { status: "error"; message: string };

/**
 * The form against the saved values; after a refused save it shows what was
 * typed, which still reads as changed ({@link useSavedFormValues}).
 *
 * A picked photo lives in its file input, not in the form's values, so
 * `isDirty` cannot see it: `hasChanges` counts it, and `discard` and a save
 * that stores another photo remount the photo field, so its file input lets go
 * of what it held and a stale photo does not ride along on the next save.
 */
function usePersonalDataForm(
  savedValues: MisDatosFormValues,
  actionData: PersonalDataActionData | undefined,
) {
  const refusedValues = readRefusedValues(actionData);
  const form = useForm<MisDatosFormValues, unknown, MisDatosFormValues>({
    defaultValues: refusedValues ?? savedValues,
    mode: "onSubmit",
    resolver: zodResolver(misDatosFormSchema),
  });
  useSavedFormValues(form, savedValues, refusedValues);
  const submit = useSubmit();
  const navigation = useNavigation();
  const [isPhotoPicked, setIsPhotoPicked] = useState(false);
  const [discardCount, setDiscardCount] = useState(0);
  const savedPhotoKey = savedValues.documentPhotoStorageKey;

  useEffect(() => {
    setIsPhotoPicked(false);
  }, [savedPhotoKey]);

  return {
    discard: () => {
      form.reset(savedValues);
      setIsPhotoPicked(false);
      setDiscardCount((count) => count + 1);
    },
    form,
    handleSubmit: createValidatedRouteSubmitHandler(form, submit),
    hasChanges: form.formState.isDirty || isPhotoPicked,
    isSaving: navigation.state === "submitting",
    photoField: {
      key: `${savedPhotoKey}:${discardCount}`,
      onPickedChange: setIsPhotoPicked,
    },
  };
}

function readRefusedValues(actionData: PersonalDataActionData | undefined) {
  return actionData && "values" in actionData ? actionData.values : undefined;
}

export function IndividualPersonalDataRouteView({
  actionData,
  loaderData,
}: {
  actionData?: PersonalDataActionData;
  loaderData: LoaderData;
}) {
  const { discard, form, handleSubmit, hasChanges, isSaving, photoField } =
    usePersonalDataForm(loaderData.values, actionData);

  useServerActionToast(actionData, { toastId: "particular-mis-datos" });

  return (
    <section
      aria-labelledby="personal-data-title"
      className="flex flex-1 flex-col gap-6"
    >
      <PortalPageHeader
        titleId="personal-data-title"
        title="Mis datos"
        description="Tus datos personales, tu documento y su foto, para que te identifiquen, te contacten y vinculen tus coreografías."
      />

      <AlertStack>
        <Alert variant="info">
          <Info aria-hidden="true" />
          <AlertTitle>Una cuenta, una persona</AlertTitle>
          <AlertDescription>
            Estos datos son de una sola persona y de su documento. Para cambiar
            el email de acceso, comunicate con nosotros.
          </AlertDescription>
        </Alert>
        <Alert variant="info">
          <Info aria-hidden="true" />
          <AlertTitle>
            Cambiar el número de documento anula el vínculo
          </AlertTitle>
          <AlertDescription>
            Si cambiás el número de documento, dejás de ver tus coreografías
            hasta que administración vuelva a confirmar el vínculo con la foto.
          </AlertDescription>
        </Alert>
      </AlertStack>

      <Card className="overflow-clip">
        <CardContent>
          <form
            encType="multipart/form-data"
            id={personalDataFormId}
            method="post"
            noValidate
            onSubmit={handleSubmit}
          >
            <FieldGroup className="grid gap-5 md:grid-cols-2">
              <TextInputField
                autoComplete="given-name"
                control={form.control}
                label="Nombre"
                name="firstName"
              />
              <TextInputField
                autoComplete="family-name"
                control={form.control}
                label="Apellido"
                name="lastName"
              />
              <SelectField
                control={form.control}
                label="Tipo de documento"
                name="documentType"
                options={documentTypeOptions}
                placeholder="Elegí un tipo"
              />
              <TextInputField
                control={form.control}
                label="Número de documento"
                name="documentNumber"
              />
              <TextInputField
                autoComplete="tel"
                control={form.control}
                inputMode="tel"
                label="Teléfono"
                maxLength={10}
                name="phone"
                placeholder={argentinePhonePlaceholder}
                type="tel"
              />
              <ReadOnlyField
                autoComplete="email"
                label="Email de acceso"
                type="email"
                value={loaderData.email}
              />
              <div className="flex flex-col gap-3 md:col-span-2">
                <DocumentLinkState state={loaderData.linkState} />
                <FileUploadField
                  key={photoField.key}
                  control={form.control}
                  disabled={isSaving}
                  existingPreviewUrl={loaderData.documentPhotoUrl}
                  fieldLabel="Foto del documento"
                  fileInputName={documentPhotoFileField}
                  label="Arrastrá o hacé click"
                  name={documentPhotoStorageKeyField}
                  offersCamera
                  onSelectedFileChange={(file) =>
                    photoField.onPickedChange(file !== null)
                  }
                  removeLabel="Quitar la foto del documento"
                  {...getAssetUploadFieldProps("individualDocumentPhoto")}
                />
              </div>
            </FieldGroup>
          </form>
        </CardContent>
        <FormActions
          backTo={INDIVIDUAL_AREA_PATH}
          form={personalDataFormId}
          hasChanges={hasChanges}
          isPending={isSaving}
          onDiscard={discard}
        />
      </Card>
    </section>
  );
}

const linkStateDescriptions = {
  linked:
    "Administración confirmó tu documento. Si cambiás su número, el vínculo vuelve a quedar pendiente hasta que lo confirme de nuevo.",
  pending:
    "Administración va a comparar la foto con tu nombre y tu documento para confirmar el vínculo.",
  unlinked:
    "Subí una foto de tu documento para que administración pueda confirmar el vínculo con tus coreografías.",
} as const satisfies Record<IndividualLinkState, string>;

function DocumentLinkState({ state }: { state: IndividualLinkState }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="flex items-center gap-2 text-sm font-medium">
        Estado del vínculo
        <IndividualLinkStateBadge state={state} />
      </p>
      <p className="text-sm text-muted-foreground">
        {linkStateDescriptions[state]}
      </p>
    </div>
  );
}

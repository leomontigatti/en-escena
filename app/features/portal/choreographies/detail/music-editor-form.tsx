import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Form, useNavigation } from "react-router";
import { toast } from "sonner";

import { FileUploadField } from "@/components/shared/file-upload-field";
import { FormActions } from "@/components/shared/form-actions";
import {
  ReadOnlyField,
  ReadOnlySelectField,
} from "@/components/shared/read-only-field";
import { Card, CardContent } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { choreographyGroupTypeOptions } from "@/lib/portal/choreographies";
import { getAssetUploadFieldProps } from "@/lib/storage/asset-kinds";
import {
  choreographyMusicSavedToastId,
  choreographyMusicUploadErrorToastId,
  updateChoreographyIntent,
  type PortalChoreographyMusicActionData,
  type PortalChoreographyMusicLoaderData,
} from "@/features/portal/choreographies/detail/music-editor.shared";
import { PortalChoreographyPeopleLists } from "@/features/portal/choreographies/detail/people-lists";

export function ChoreographyMusicEditorForm({
  actionData,
  loaderData,
}: {
  actionData: PortalChoreographyMusicActionData;
  loaderData: PortalChoreographyMusicLoaderData;
}) {
  const choreography = loaderData.choreography;
  // A withdrawn choreography is read-only for the academy, music included: it
  // is not taking part, and only an administrator can bring it back.
  const canEditMusic =
    !loaderData.eventContext.isReadOnly &&
    !choreography.isEvaluated &&
    !choreography.isWithdrawn;
  const [musicHasValidationError, setMusicHasValidationError] = useState(false);
  const [selectedMusicFileName, setSelectedMusicFileName] = useState<
    string | null
  >(null);
  const selectedMusicStorageKey =
    (actionData?.status === "update-error"
      ? actionData.selectedMusicStorageKey
      : undefined) ??
    choreography.musicStorageKey ??
    "";
  const [musicStorageKey, setMusicStorageKey] = useState(
    selectedMusicStorageKey,
  );
  useEffect(() => {
    setMusicStorageKey(selectedMusicStorageKey);
    setSelectedMusicFileName(null);
  }, [selectedMusicStorageKey]);

  useEffect(() => {
    if (
      actionData?.status === "update-error" ||
      actionData?.status === "error"
    ) {
      toast.error(actionData.message, {
        id: choreographyMusicUploadErrorToastId,
      });
    }

    if (actionData?.status === "success") {
      toast.success(actionData.message, {
        id: choreographyMusicSavedToastId,
      });
    }
  }, [actionData?.message, actionData?.status]);

  // A replacement is stored under the same key, so nothing above sees it land.
  // Each save starts the field over from the stored song instead: without it
  // the saved file would still read as a picked one, and `Guardar` would offer
  // to upload it again.
  const [savedCount, setSavedCount] = useState(0);
  useEffect(() => {
    if (actionData?.status === "success") {
      setSavedCount((count) => count + 1);
      setSelectedMusicFileName(null);
    }
  }, [actionData]);

  const form = useForm<{ musicStorageKey: string }>({
    values: { musicStorageKey: selectedMusicStorageKey },
  });
  const navigation = useNavigation();
  const isSubmitting =
    navigation.state !== "idle" &&
    navigation.formData?.get("intent") === updateChoreographyIntent;

  const hasMusicChanged = useMemo(
    () =>
      selectedMusicFileName !== null ||
      musicStorageKey !== (choreography.musicStorageKey ?? ""),
    [choreography.musicStorageKey, musicStorageKey, selectedMusicFileName],
  );

  // Puts the field back on the stored song: the picked file, or the delete,
  // goes, and the remount clears the file input itself.
  const discardMusicChanges = useCallback(() => {
    setMusicStorageKey(choreography.musicStorageKey ?? "");
    setSelectedMusicFileName(null);
    setMusicHasValidationError(false);
    form.setValue("musicStorageKey", choreography.musicStorageKey ?? "");
    setSavedCount((count) => count + 1);
  }, [choreography.musicStorageKey, form]);

  const handleMusicValidationErrorChange = useCallback((hasError: boolean) => {
    setMusicHasValidationError(hasError);
  }, []);
  const handleMusicStorageKeyChange = useCallback(
    (nextStorageKey: string) => {
      setMusicStorageKey(nextStorageKey);
      form.setValue("musicStorageKey", nextStorageKey, {
        shouldDirty: true,
      });
    },
    [form],
  );
  const handleSelectedMusicFileChange = useCallback(
    (file: File | null) => {
      setSelectedMusicFileName(file?.name ?? null);

      if (file) {
        // The picked file replaces the stored one on save, so the stored key
        // goes back in, here and in the form, after a delete took it out.
        setMusicStorageKey(choreography.musicStorageKey ?? "");
        form.setValue("musicStorageKey", choreography.musicStorageKey ?? "", {
          shouldDirty: true,
        });
      }
    },
    [choreography.musicStorageKey, form],
  );

  return (
    <Form
      method="post"
      encType="multipart/form-data"
      className="flex flex-1 flex-col gap-6"
    >
      <Card className="overflow-clip">
        <CardContent className="flex flex-col gap-5">
          <input type="hidden" name="intent" value={updateChoreographyIntent} />

          <FieldGroup className="grid gap-5 md:grid-cols-2">
            <ReadOnlyField
              className="md:col-span-2"
              label="Nombre"
              value={choreography.name}
            />
            <ReadOnlyField
              label="Modalidad"
              value={choreography.modalityName}
            />
            <ReadOnlyField
              label="Submodalidad"
              value={choreography.submodalityName ?? ""}
            />
            <ReadOnlyField
              label="Categoría"
              value={choreography.categoryName}
            />
            <ReadOnlySelectField
              label="Tipo de grupo"
              options={choreographyGroupTypeOptions}
              value={choreography.groupType}
            />
            {/* Two different kinds of empty: the category does not ask for a
                level, or it asks and it is missing. The second is what leaves the
                choreography Incompleta, so it cannot read the same as the first. */}
            <ReadOnlyField
              label="Nivel de experiencia"
              value={
                choreography.experienceLevelName ??
                (choreography.requiresExperienceLevel
                  ? "Sin asignar"
                  : "No aplica")
              }
            />
            <ReadOnlyField
              label="Cronograma"
              value={choreography.scheduleLabel}
            />
          </FieldGroup>

          <FieldGroup>
            <PortalChoreographyPeopleLists choreography={choreography} />
            <FileUploadField
              key={savedCount}
              control={form.control}
              name="musicStorageKey"
              fileInputName="musicFile"
              disabled={!canEditMusic}
              fieldLabel="Archivo de música"
              label="Arrastrá o hacé click para cargar la música"
              uploadedLabel="Archivo de música cargado"
              downloadLabel="Descargar música"
              downloadUrl={choreography.musicDownloadUrl}
              existingPreviewUrl={choreography.musicDownloadUrl}
              {...getAssetUploadFieldProps("choreographyMusic")}
              previewKind="audio"
              removeLabel="Borrar música"
              onSelectedFileChange={handleSelectedMusicFileChange}
              onStorageKeyChange={handleMusicStorageKeyChange}
              onValidationErrorChange={handleMusicValidationErrorChange}
            />
          </FieldGroup>
        </CardContent>
        <FormActions
          backTo="/portal/coreografias"
          canEdit={canEditMusic}
          canSave={!musicHasValidationError}
          hasChanges={hasMusicChanged}
          isPending={isSubmitting}
          onDiscard={discardMusicChanges}
        />
      </Card>
    </Form>
  );
}

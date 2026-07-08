import { Check, LoaderCircle, Lock } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Form, Link } from "react-router";
import { toast } from "sonner";

import { FileUploadField } from "@/components/shared/file-upload-field";
import { MultiComboboxField } from "@/components/shared/multi-combobox-field";
import {
  ReadOnlyField,
  ReadOnlySelectField,
} from "@/components/shared/read-only-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { choreographyGroupTypeOptions } from "@/lib/portal/choreographies";
import { ChoreographySelectPreviewField } from "@/features/portal/choreographies/detail/roster-editor-fields";
import {
  choreographyMusicAccept,
  choreographyMusicAllowedMimeTypes,
  choreographyMusicInvalidTypeMessage,
  choreographyMusicMaxFileSizeBytes,
  choreographyMusicMaxFileSizeMessage,
  choreographyMusicUploadErrorToastId,
  type ChoreographyRosterEditorActionData,
  type ChoreographyRosterEditorLoaderData,
  updateChoreographyIntent,
} from "@/features/portal/choreographies/detail/roster-editor.shared";
import { useChoreographyRosterEditorForm } from "@/features/portal/choreographies/detail/use-choreography-roster-editor-form";

export function ChoreographyRosterEditorForm({
  actionData,
  loaderData,
}: {
  actionData: ChoreographyRosterEditorActionData;
  loaderData: ChoreographyRosterEditorLoaderData;
}) {
  const choreography = loaderData.choreography;
  const [musicHasValidationError, setMusicHasValidationError] = useState(false);
  const [selectedMusicFileName, setSelectedMusicFileName] = useState<
    string | null
  >(null);
  const selectedMusicStorageKey =
    actionData?.selectedMusicStorageKey ?? choreography.musicStorageKey ?? "";
  const [musicStorageKey, setMusicStorageKey] = useState(
    selectedMusicStorageKey,
  );
  const hasActiveFinancialLink =
    loaderData.dancerEditingEligibility.reasonCode === "active-financial-link";
  useEffect(() => {
    setMusicStorageKey(selectedMusicStorageKey);
    setSelectedMusicFileName(null);
  }, [selectedMusicStorageKey]);

  useEffect(() => {
    if (actionData?.status === "update-error") {
      toast.error(actionData.message, {
        id: choreographyMusicUploadErrorToastId,
      });
    }
  }, [actionData?.message, actionData?.section, actionData?.status]);

  const hasMusicChanged = useMemo(
    () =>
      selectedMusicFileName !== null ||
      musicStorageKey !== (choreography.musicStorageKey ?? ""),
    [choreography.musicStorageKey, musicStorageKey, selectedMusicFileName],
  );
  const editor = useChoreographyRosterEditorForm({
    actionData,
    hasMusicChanged,
    loaderData,
    musicHasValidationError,
  });
  const {
    canEditDancers,
    canEditMusic,
    canEditProfessors,
    canSubmit,
    dancerOptions,
    derivedResolution,
    experienceLevelFieldId,
    experienceLevelOptions,
    form,
    handleSubmit,
    hasResolvedRosterChange,
    isResolving,
    isSubmitting,
    professorOptions,
    readonlyExperienceLevelName,
    readonlyScheduleLabel,
    scheduleFieldId,
    scheduleResolution,
    scheduleSelectOptions,
  } = editor;
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
        form.setValue("musicStorageKey", choreography.musicStorageKey ?? "", {
          shouldDirty: true,
        });
      }
    },
    [choreography.musicStorageKey, form],
  );

  return (
    <Form method="post" encType="multipart/form-data" onSubmit={handleSubmit}>
      <Card>
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
              value={derivedResolution.categoryName ?? "Sin asignar"}
            />
            <ReadOnlySelectField
              label="Tipo de grupo"
              options={choreographyGroupTypeOptions}
              value={derivedResolution.groupType}
            />
            {hasResolvedRosterChange &&
            derivedResolution.experienceLevelRequired ? (
              <ChoreographySelectPreviewField
                control={form.control}
                fieldName="experienceLevelId"
                id={experienceLevelFieldId}
                label="Nivel de experiencia"
                options={experienceLevelOptions}
              />
            ) : (
              <ReadOnlyField
                label="Nivel de experiencia"
                value={readonlyExperienceLevelName}
              />
            )}
            {hasResolvedRosterChange &&
            scheduleResolution?.status === "multiple" ? (
              <ChoreographySelectPreviewField
                control={form.control}
                fieldName="scheduleCapacityId"
                id={scheduleFieldId}
                label="Cronograma"
                options={scheduleSelectOptions}
              />
            ) : (
              <ReadOnlyField label="Cronograma" value={readonlyScheduleLabel} />
            )}
          </FieldGroup>

          <FieldGroup>
            <MultiComboboxField
              control={form.control}
              disabled={!canEditDancers}
              emptyMessage="Sin bailarines disponibles"
              inputName="dancerIds"
              label="Bailarines"
              name="dancerIds"
              options={dancerOptions}
              placeholder="Buscar bailarines"
              searchable={true}
              trailingIcon={
                hasActiveFinancialLink ? (
                  <Lock aria-label="Bailarines bloqueados por vínculo financiero activo" />
                ) : null
              }
            />

            <MultiComboboxField
              control={form.control}
              disabled={!canEditProfessors}
              emptyMessage="Sin profesores disponibles"
              inputName="professorIds"
              label="Profesores"
              name="professorIds"
              options={professorOptions}
              placeholder="Buscar profesores"
              searchable={true}
            />
            <FileUploadField
              control={form.control}
              name="musicStorageKey"
              fileInputName="musicFile"
              disabled={!canEditMusic}
              fieldLabel="Archivo de música"
              label="Arrastrá o hacé click para cargar la música"
              uploadedLabel="Archivo de música cargado"
              helperText="MP3, M4A, WAV u OGG - max 50 MB"
              downloadLabel="Descargar música"
              downloadUrl={choreography.musicDownloadUrl}
              accept={choreographyMusicAccept}
              allowedMimeTypes={choreographyMusicAllowedMimeTypes}
              invalidTypeMessage={choreographyMusicInvalidTypeMessage}
              maxFileSizeBytes={choreographyMusicMaxFileSizeBytes}
              maxFileSizeMessage={choreographyMusicMaxFileSizeMessage}
              previewSelectedFile={false}
              removeLabel="Borrar música"
              onSelectedFileChange={handleSelectedMusicFileChange}
              onStorageKeyChange={handleMusicStorageKeyChange}
              onValidationErrorChange={handleMusicValidationErrorChange}
              variant="compact"
            />
          </FieldGroup>
        </CardContent>
        <CardFooter className="justify-end gap-3 border-0 bg-transparent pt-0">
          <Button asChild variant="outline" size="lg">
            <Link to="/portal/coreografias">Volver</Link>
          </Button>
          <Button type="submit" size="lg" disabled={!canSubmit}>
            {isResolving || isSubmitting ? (
              <LoaderCircle
                aria-hidden="true"
                className="animate-spin"
                data-icon="inline-start"
              />
            ) : (
              <Check aria-hidden="true" data-icon="inline-start" />
            )}
            Guardar
          </Button>
        </CardFooter>
      </Card>
    </Form>
  );
}

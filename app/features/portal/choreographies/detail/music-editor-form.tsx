import { Info } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Form, useNavigation } from "react-router";
import { toast } from "sonner";

import { FileUploadField } from "@/components/shared/file-upload-field";
import { FormActions } from "@/components/shared/form-actions";
import {
  ProfessionalEvaluationSwitch,
  professionalEvaluationFieldInputClassName,
} from "@/components/shared/professional-evaluation-switch";
import {
  ReadOnlyField,
  ReadOnlySelectField,
} from "@/components/shared/read-only-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { evaluatedChoreographyAlert } from "@/lib/choreographies/choreography-messages";
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
  const musicLock = readMusicLock({
    isEvaluated: choreography.isEvaluated,
    isEventReadOnly: loaderData.eventContext.isReadOnly,
    isWithdrawn: choreography.isWithdrawn,
  });
  const canEditMusic = musicLock === null;
  // `Evaluar como profesional` is the other thing the academy edits here, and
  // it closes with the music: once evaluated, the judges read it as it was.
  const [professionalEvaluation, setProfessionalEvaluation] = useState(
    choreography.professionalEvaluation,
  );
  useEffect(() => {
    setProfessionalEvaluation(choreography.professionalEvaluation);
  }, [choreography.professionalEvaluation]);
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
  const hasChanges =
    hasMusicChanged ||
    professionalEvaluation !== choreography.professionalEvaluation;

  // Puts the field back on the stored song: the picked file, or the delete,
  // goes, and the remount clears the file input itself.
  const discardChanges = useCallback(() => {
    setMusicStorageKey(choreography.musicStorageKey ?? "");
    setSelectedMusicFileName(null);
    setMusicHasValidationError(false);
    setProfessionalEvaluation(choreography.professionalEvaluation);
    form.setValue("musicStorageKey", choreography.musicStorageKey ?? "");
    setSavedCount((count) => count + 1);
  }, [choreography.musicStorageKey, choreography.professionalEvaluation, form]);

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
      {musicLock ? <MusicLockAlert lock={musicLock} /> : null}
      <Card className="overflow-clip">
        <CardContent className="flex flex-col gap-5">
          <input type="hidden" name="intent" value={updateChoreographyIntent} />
          <input
            type="hidden"
            name="professionalEvaluation"
            value={professionalEvaluation ? "true" : "false"}
          />

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
              inputClassName={professionalEvaluationFieldInputClassName}
              trailing={
                <ProfessionalEvaluationSwitch
                  checked={professionalEvaluation}
                  disabled={!canEditMusic}
                  placement="field"
                  onCheckedChange={setProfessionalEvaluation}
                />
              }
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
          hasChanges={hasChanges}
          isPending={isSubmitting}
          onDiscard={discardChanges}
        />
      </Card>
    </Form>
  );
}

/**
 * Why the music and the evaluation cannot change, as the state that closed
 * them and what reopens them (style guide, Detail pages), or `null` while they
 * can. It reads like administration's alert for the same choreography. An
 * evaluation is for good, so it speaks alone; a withdrawal and an inactive
 * event are the administration's to undo.
 */
function readMusicLock(state: {
  isEvaluated: boolean;
  isEventReadOnly: boolean;
  isWithdrawn: boolean;
}) {
  if (state.isEvaluated) {
    return evaluatedChoreographyAlert;
  }

  if (state.isWithdrawn && state.isEventReadOnly) {
    return {
      description:
        "No puede modificarse hasta que administración la restaure y vuelva a activar el evento.",
      title: "Esta coreografía está retirada y el evento ya no está activo",
    };
  }

  if (state.isWithdrawn) {
    return {
      description: "No puede modificarse hasta que administración la restaure.",
      title: "Esta coreografía está retirada",
    };
  }

  if (state.isEventReadOnly) {
    return {
      description:
        "Esta coreografía no puede modificarse hasta que administración vuelva a activar el evento.",
      title: "El evento ya no está activo",
    };
  }

  return null;
}

function MusicLockAlert({
  lock,
}: {
  lock: { description: string; title: string };
}) {
  return (
    <Alert variant="info">
      <Info aria-hidden="true" />
      <AlertTitle>{lock.title}</AlertTitle>
      <AlertDescription>{lock.description}</AlertDescription>
    </Alert>
  );
}

import { zodResolver } from "@hookform/resolvers/zod";
import { Info } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { useNavigation } from "react-router";
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
import {
  createValidatedRouteSubmitHandler,
  useOptionalFormAction,
  useOptionalSubmit,
} from "@/lib/shared/forms";
import { getAssetUploadFieldProps } from "@/lib/storage/asset-kinds";
import {
  choreographyMusicFormSchema,
  choreographyMusicSavedToastId,
  choreographyMusicUploadErrorToastId,
  updateChoreographyIntent,
  type ChoreographyMusicFormValues,
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
  const {
    discardMusicChanges,
    form,
    handleMusicStorageKeyChange,
    handleMusicValidationErrorChange,
    handleSelectedMusicFileChange,
    hasChanges,
    isSubmitting,
    musicHasValidationError,
    professionalEvaluation,
    savedCount,
    submitMusic,
  } = useChoreographyMusicForm({
    actionData,
    storedMusicStorageKey: choreography.musicStorageKey ?? "",
    storedProfessionalEvaluation: choreography.professionalEvaluation,
  });

  return (
    <form
      method="post"
      encType="multipart/form-data"
      noValidate
      onSubmit={submitMusic}
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

          <ChoreographyReadOnlyFields
            categoryTrailing={
              <Controller
                control={form.control}
                name="professionalEvaluation"
                render={({ field }) => (
                  <ProfessionalEvaluationSwitch
                    checked={field.value}
                    disabled={!canEditMusic}
                    placement="field"
                    onBlur={field.onBlur}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
            }
            choreography={choreography}
          />

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
          onDiscard={discardMusicChanges}
        />
      </Card>
    </form>
  );
}

/**
 * The music form's state: the stored key in React Hook Form, the picked file's
 * name and the upload field's own validation beside it, and the save's
 * feedback. The post is the form element itself, so the picked file goes with
 * it: React Hook Form validates, and the DOM carries what it does not hold.
 */
function useChoreographyMusicForm({
  actionData,
  storedMusicStorageKey,
  storedProfessionalEvaluation,
}: {
  actionData: PortalChoreographyMusicActionData;
  storedMusicStorageKey: string;
  storedProfessionalEvaluation: boolean;
}) {
  const selectedMusicStorageKey = readAnsweredMusicStorageKey(
    actionData,
    storedMusicStorageKey,
  );
  const field = useMusicFieldState({ actionData, selectedMusicStorageKey });

  useMusicSaveToast(actionData);

  // `values` follows what the route answered: the stored key, or the one a
  // refused save sent back, and the stored evaluation. What the academy
  // changed and the answer did not settle stays, so a refused save keeps the
  // switch where it was set.
  const form = useForm<ChoreographyMusicFormValues>({
    resetOptions: { keepDirtyValues: true },
    resolver: zodResolver(choreographyMusicFormSchema),
    values: {
      musicStorageKey: selectedMusicStorageKey,
      professionalEvaluation: storedProfessionalEvaluation,
    },
  });
  const [musicStorageKey, professionalEvaluation] = useWatch({
    control: form.control,
    name: ["musicStorageKey", "professionalEvaluation"],
  });
  const submit = useOptionalSubmit();
  const formAction = useOptionalFormAction();
  const navigation = useNavigation();
  const isSubmitting =
    navigation.state !== "idle" &&
    navigation.formData?.get("intent") === updateChoreographyIntent;

  const hasChanges =
    field.selectedMusicFileName !== null ||
    musicStorageKey !== storedMusicStorageKey ||
    professionalEvaluation !== storedProfessionalEvaluation;
  const { restartField, setMusicHasValidationError, setSelectedMusicFileName } =
    field;

  // Puts the field back on the stored song: the picked file, or the delete,
  // goes, and the remount clears the file input itself.
  const discardMusicChanges = useCallback(() => {
    restartField();
    setMusicHasValidationError(false);
    form.setValue("musicStorageKey", storedMusicStorageKey);
    // `Evaluar como profesional` is the other thing the academy edits here,
    // and it closes with the music: once evaluated, the judges read it as it
    // was.
    form.setValue("professionalEvaluation", storedProfessionalEvaluation);
  }, [
    form,
    restartField,
    setMusicHasValidationError,
    storedMusicStorageKey,
    storedProfessionalEvaluation,
  ]);

  const handleMusicStorageKeyChange = useCallback(
    (nextStorageKey: string) => {
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
        // goes back in after a delete took it out.
        form.setValue("musicStorageKey", storedMusicStorageKey, {
          shouldDirty: true,
        });
      }
    },
    [form, setSelectedMusicFileName, storedMusicStorageKey],
  );

  return {
    discardMusicChanges,
    form,
    handleMusicStorageKeyChange,
    handleMusicValidationErrorChange: setMusicHasValidationError,
    handleSelectedMusicFileChange,
    hasChanges,
    isSubmitting,
    musicHasValidationError: field.musicHasValidationError,
    professionalEvaluation,
    savedCount: field.savedCount,
    submitMusic: createValidatedRouteSubmitHandler(form, submit, formAction),
  };
}

/**
 * What the upload field holds beside the form: the picked file's name, its own
 * validation, and the count that remounts it.
 *
 * A replacement is stored under the same key, so nothing above sees it land.
 * Each save starts the field over from the stored song instead: without it the
 * saved file would still read as a picked one, and `Guardar` would offer to
 * upload it again.
 */
function useMusicFieldState({
  actionData,
  selectedMusicStorageKey,
}: {
  actionData: PortalChoreographyMusicActionData;
  selectedMusicStorageKey: string;
}) {
  const [musicHasValidationError, setMusicHasValidationError] = useState(false);
  const [selectedMusicFileName, setSelectedMusicFileName] = useState<
    string | null
  >(null);
  const [savedCount, setSavedCount] = useState(0);
  const restartField = useCallback(() => {
    setSelectedMusicFileName(null);
    setSavedCount((count) => count + 1);
  }, []);

  useEffect(() => {
    setSelectedMusicFileName(null);
  }, [selectedMusicStorageKey]);

  useEffect(() => {
    if (actionData?.status === "success") {
      restartField();
    }
  }, [actionData, restartField]);

  return {
    musicHasValidationError,
    restartField,
    savedCount,
    selectedMusicFileName,
    setMusicHasValidationError,
    setSelectedMusicFileName,
  };
}

/**
 * The key the field starts from: the one a refused save sent back, which
 * keeps a delete the academy asked for, or else the stored one.
 */
function readAnsweredMusicStorageKey(
  actionData: PortalChoreographyMusicActionData,
  storedMusicStorageKey: string,
) {
  const answered =
    actionData?.status === "update-error"
      ? actionData.selectedMusicStorageKey
      : undefined;

  return answered ?? storedMusicStorageKey;
}

/** The save's answer, as a toast either way. */
function useMusicSaveToast(actionData: PortalChoreographyMusicActionData) {
  useEffect(() => {
    if (!actionData) {
      return;
    }

    if (actionData.status === "success") {
      toast.success(actionData.message, { id: choreographyMusicSavedToastId });
      return;
    }

    toast.error(actionData.message, {
      id: choreographyMusicUploadErrorToastId,
    });
  }, [actionData]);
}

/**
 * What the academy reads about the choreography and cannot change here. The
 * one control beside them, `Evaluar como profesional`, is the form's and rides
 * in at the category's end, where the wizard sets it.
 */
function ChoreographyReadOnlyFields({
  categoryTrailing,
  choreography,
}: {
  categoryTrailing: ReactNode;
  choreography: PortalChoreographyMusicLoaderData["choreography"];
}) {
  return (
    <FieldGroup className="grid gap-5 md:grid-cols-2">
      <ReadOnlyField
        className="md:col-span-2"
        label="Nombre"
        value={choreography.name}
      />
      <ReadOnlyField label="Modalidad" value={choreography.modalityName} />
      <ReadOnlyField
        label="Submodalidad"
        value={choreography.submodalityName ?? ""}
      />
      <ReadOnlyField
        label="Categoría"
        inputClassName={professionalEvaluationFieldInputClassName}
        trailing={categoryTrailing}
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
          (choreography.requiresExperienceLevel ? "Sin asignar" : "No aplica")
        }
      />
      <ReadOnlyField label="Cronograma" value={choreography.scheduleLabel} />
    </FieldGroup>
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

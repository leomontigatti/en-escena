import { Check, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Form, Link, useNavigation } from "react-router";
import { toast } from "sonner";

import { FileUploadField } from "@/components/shared/file-upload-field";
import {
  ReadOnlyField,
  ReadOnlySelectField,
} from "@/components/shared/read-only-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { choreographyGroupTypeOptions } from "@/lib/portal/choreographies";
import {
  choreographyMusicAccept,
  choreographyMusicAllowedMimeTypes,
  choreographyMusicInvalidTypeMessage,
  choreographyMusicMaxFileSizeBytes,
  choreographyMusicMaxFileSizeMessage,
  choreographyMusicUploadErrorToastId,
  updateChoreographyIntent,
  type PortalChoreographyMusicActionData,
  type PortalChoreographyMusicLoaderData,
} from "@/features/portal/choreographies/detail/music-editor.shared";

export function ChoreographyMusicEditorForm({
  actionData,
  loaderData,
}: {
  actionData: PortalChoreographyMusicActionData;
  loaderData: PortalChoreographyMusicLoaderData;
}) {
  const choreography = loaderData.choreography;
  const canEditMusic =
    !loaderData.eventContext.isReadOnly && !choreography.hasPresentation;
  const [musicHasValidationError, setMusicHasValidationError] = useState(false);
  const [selectedMusicFileName, setSelectedMusicFileName] = useState<
    string | null
  >(null);
  const selectedMusicStorageKey =
    actionData?.selectedMusicStorageKey ?? choreography.musicStorageKey ?? "";
  const [musicStorageKey, setMusicStorageKey] = useState(
    selectedMusicStorageKey,
  );
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
  }, [actionData?.message, actionData?.status]);

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
  const canSubmit =
    canEditMusic &&
    hasMusicChanged &&
    !musicHasValidationError &&
    !isSubmitting;

  const dancerNames = choreography.dancers
    .map((dancer) => `${dancer.firstName} ${dancer.lastName}`)
    .join(", ");
  const professorNames = choreography.professors
    .map((professor) => `${professor.firstName} ${professor.lastName}`)
    .join(", ");

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
    <Form method="post" encType="multipart/form-data">
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
              value={choreography.categoryName ?? "Sin asignar"}
            />
            <ReadOnlySelectField
              label="Tipo de grupo"
              options={choreographyGroupTypeOptions}
              value={choreography.groupType}
            />
            <ReadOnlyField
              label="Nivel de experiencia"
              value={choreography.experienceLevelName ?? "Sin asignar"}
            />
            <ReadOnlyField
              label="Cronograma"
              value={choreography.scheduleLabel}
            />
          </FieldGroup>

          <FieldGroup>
            <ReadOnlyField label="Bailarines" value={dancerNames} />
            <ReadOnlyField label="Profesores" value={professorNames} />
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
            {isSubmitting ? (
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

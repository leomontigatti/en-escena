import { zodResolver } from "@hookform/resolvers/zod";
import { Check, LoaderCircle, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigation, useSubmit } from "react-router";
import { useForm } from "react-hook-form";
import { z } from "zod";

import {
  AdminResourceFormCard,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { DeleteDialog } from "@/components/shared/delete-dialog";
import { FileUploadField } from "@/components/shared/file-upload-field";
import { MultiComboboxField } from "@/components/shared/multi-combobox-field";
import { ReadOnlyField } from "@/components/shared/read-only-field";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { TextInputField } from "@/components/shared/text-input-field";
import { Button } from "@/components/ui/button";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { FieldGroup } from "@/components/ui/field";
import { formatGroupTypeLabel } from "@/lib/portal/choreographies";
import {
  createValidatedRouteFormDataSubmitHandler,
  isRouteFormPending,
  requiredFieldMessage,
} from "@/lib/shared/forms";
import { useServerActionToast } from "@/lib/shared/toasts";

import {
  deleteAdministrativeChoreographyIntent,
  renameAdministrativeChoreographyIntent,
  type AdministrativeChoreographyDeleteBlocker,
  type AdministrativeChoreographyActionData,
} from "./shared";
import type { AdministrativeChoreographyDetailLoaderData } from "./server";

type AdministracionCoreografiaDetalleRouteViewProps = {
  actionData?: AdministrativeChoreographyActionData;
  initialDeleteDialogOpen?: boolean;
  loaderData: AdministrativeChoreographyDetailLoaderData;
};

type AdministrativeChoreographyFormValues = z.input<
  typeof administrativeChoreographyFormSchema
>;

const administrativeChoreographyFormSchema = z.object({
  dancerIds: z.array(z.string()),
  musicStorageKey: z.string(),
  name: z.string().trim().min(1, requiredFieldMessage),
  professorIds: z.array(z.string()),
});

const choreographyMusicAccept =
  "audio/mpeg,audio/mp4,audio/m4a,audio/x-m4a,audio/aac,audio/wav,audio/x-wav,audio/ogg";
const choreographyMusicAllowedMimeTypes = [
  "audio/aac",
  "audio/m4a",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/x-m4a",
  "audio/x-wav",
];
const choreographyMusicMaxFileSizeBytes = 50 * 1024 * 1024;

export function AdministracionCoreografiaDetalleRouteView({
  actionData,
  initialDeleteDialogOpen = false,
  loaderData,
}: AdministracionCoreografiaDetalleRouteViewProps) {
  useServerActionToast(actionData, {
    toastId: "admin-choreography-detail:error",
  });

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(
    initialDeleteDialogOpen,
  );

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      requireSelectedEvent={false}
      title="Detalle coreografía"
      description="Revisá la coreografía registrada para el evento activo."
      headerAction={
        loaderData.canEdit ? (
          <ResourceActionsMenu contentClassName="w-52">
            <DropdownMenuGroup>
              <DropdownMenuItem
                variant="destructive"
                onSelect={(event) => {
                  event.preventDefault();
                  setIsDeleteDialogOpen(true);
                }}
              >
                <Trash2 aria-hidden="true" />
                Eliminar coreografía
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </ResourceActionsMenu>
        ) : null
      }
    >
      <AdministrativeChoreographyDetailForm
        actionData={actionData}
        loaderData={loaderData}
      />

      {loaderData.canEdit ? (
        <DeleteDialog
          blockedDescription={
            loaderData.deletion.canDelete ? undefined : (
              <BlockedDeleteReasons blockers={loaderData.deletion.blockers} />
            )
          }
          blockedTitle="No se puede eliminar esta coreografía"
          description={
            loaderData.deletion.canDelete
              ? "La eliminación es definitiva y libera el cupo de cronograma."
              : "Esta coreografía tiene registros asociados que conservan trazabilidad."
          }
          intentValue={deleteAdministrativeChoreographyIntent}
          isBlocked={!loaderData.deletion.canDelete}
          onOpenChange={setIsDeleteDialogOpen}
          open={isDeleteDialogOpen}
          recordId={loaderData.choreography.id}
          title="Eliminar coreografía"
        />
      ) : null}
    </AdminResourceLayout>
  );
}

function AdministrativeChoreographyDetailForm({
  actionData,
  loaderData,
}: {
  actionData?: AdministrativeChoreographyActionData;
  loaderData: AdministrativeChoreographyDetailLoaderData;
}) {
  const choreography = loaderData.choreography;
  const defaultValues = useMemo(
    () => getAdministrativeChoreographyFormValues(loaderData, actionData),
    [actionData, loaderData],
  );
  const form = useForm<AdministrativeChoreographyFormValues>({
    defaultValues,
    mode: "onSubmit",
    resolver: zodResolver(administrativeChoreographyFormSchema),
  });
  const { reset } = form;
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSaving = isRouteFormPending(navigation, {
    intent: renameAdministrativeChoreographyIntent,
  });

  useEffect(() => {
    reset(defaultValues);
  }, [defaultValues, reset]);

  return (
    <form
      method="post"
      noValidate
      onSubmit={
        loaderData.canEdit
          ? createValidatedRouteFormDataSubmitHandler(form, submit)
          : undefined
      }
    >
      {loaderData.canEdit ? (
        <input
          type="hidden"
          name="intent"
          value={renameAdministrativeChoreographyIntent}
        />
      ) : null}

      <AdminResourceFormCard
        footer={
          <FormActions
            backToList={loaderData.backToList}
            canEdit={loaderData.canEdit}
            isSaving={isSaving}
          />
        }
      >
        <FieldGroup className="grid gap-5 md:grid-cols-2">
          <ReadOnlyField
            className="md:col-span-2"
            label="Academia"
            value={choreography.academyName}
          />
          {loaderData.canEdit ? (
            <TextInputField
              className="md:col-span-2"
              control={form.control}
              label="Nombre"
              name="name"
            />
          ) : (
            <ReadOnlyField
              className="md:col-span-2"
              label="Nombre"
              value={choreography.name}
            />
          )}
          <ReadOnlyField label="Modalidad" value={choreography.modalityName} />
          <ReadOnlyField
            label="Submodalidad"
            value={choreography.submodalityName ?? ""}
          />
          <ReadOnlyField
            label="Categoría"
            value={choreography.categoryName ?? "Sin asignar"}
          />
          <ReadOnlyField
            label="Tipo de grupo"
            value={formatGroupTypeLabel(choreography.groupType)}
          />
          <ReadOnlyField
            label="Nivel de experiencia"
            value={choreography.experienceLevelName ?? ""}
          />
          <ReadOnlyField
            label="Cronograma"
            value={choreography.scheduleLabel}
          />
        </FieldGroup>

        <FieldGroup>
          <MultiComboboxField
            control={form.control}
            disabled
            emptyMessage="Sin bailarines vinculados"
            inputName="dancerIds"
            label="Bailarines"
            name="dancerIds"
            options={choreography.dancers.map(toPersonOption)}
            placeholder="Sin bailarines vinculados"
            searchable
          />

          <MultiComboboxField
            control={form.control}
            disabled
            emptyMessage="Sin profesores vinculados"
            inputName="professorIds"
            label="Profesores"
            name="professorIds"
            options={choreography.professors.map(toPersonOption)}
            placeholder="Sin profesores vinculados"
            searchable
          />

          <FileUploadField
            accept={choreographyMusicAccept}
            allowedMimeTypes={choreographyMusicAllowedMimeTypes}
            control={form.control}
            disabled
            downloadLabel="Descargar música"
            downloadUrl={choreography.musicDownloadUrl}
            fieldLabel="Archivo de música"
            fileInputName="musicFile"
            helperText="MP3, M4A, WAV u OGG - max 50 MB"
            invalidTypeMessage="El archivo de música debe ser MP3, M4A, WAV u OGG."
            label="No hay música cargada"
            maxFileSizeBytes={choreographyMusicMaxFileSizeBytes}
            maxFileSizeMessage="El archivo de música no puede superar 50 MB."
            name="musicStorageKey"
            previewSelectedFile={false}
            removeLabel="Borrar música"
            uploadedLabel="Archivo de música cargado"
            variant="compact"
          />
        </FieldGroup>
      </AdminResourceFormCard>
    </form>
  );
}

function FormActions({
  backToList,
  canEdit,
  isSaving,
}: {
  backToList: string;
  canEdit: boolean;
  isSaving: boolean;
}) {
  return (
    <>
      <Button asChild variant="outline" size="lg">
        <Link to={backToList}>Volver</Link>
      </Button>
      {canEdit ? (
        <Button type="submit" size="lg" disabled={isSaving}>
          {isSaving ? (
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
      ) : null}
    </>
  );
}

function getAdministrativeChoreographyFormValues(
  loaderData: AdministrativeChoreographyDetailLoaderData,
  actionData?: AdministrativeChoreographyActionData,
): AdministrativeChoreographyFormValues {
  const choreography = loaderData.choreography;

  return {
    dancerIds: choreography.dancers.map((dancer) => dancer.id),
    musicStorageKey: choreography.musicStorageKey ?? "",
    name: actionData?.values.name ?? choreography.name,
    professorIds: choreography.professors.map((professor) => professor.id),
  };
}

function toPersonOption(person: {
  firstName: string;
  id: string;
  lastName: string;
}) {
  return {
    label: `${person.firstName} ${person.lastName}`,
    value: person.id,
  };
}

function BlockedDeleteReasons({
  blockers,
}: {
  blockers: AdministrativeChoreographyDeleteBlocker[];
}) {
  return (
    <div>
      <p>Resolvé estos bloqueos antes de eliminarla:</p>
      <ul className="mt-2 list-disc pl-5">
        {blockers.map((blocker) => (
          <li key={blocker.code}>{blocker.label}</li>
        ))}
      </ul>
    </div>
  );
}

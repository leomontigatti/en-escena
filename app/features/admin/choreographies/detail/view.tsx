import { zodResolver } from "@hookform/resolvers/zod";
import { Check, ChevronLeft, LoaderCircle, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSubmit } from "react-router";
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
import { SelectField } from "@/components/shared/select-field";
import { TextInputField } from "@/components/shared/text-input-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { FieldGroup } from "@/components/ui/field";
import { formatGroupTypeLabel } from "@/lib/portal/choreographies";
import { requiredFieldMessage } from "@/lib/shared/forms";
import { useServerActionToast } from "@/lib/shared/toasts";

import {
  canSubmitAdministrativeChoreographyEdit,
  hasNoCompatibleCategory,
} from "./roster-form-state";
import {
  deleteAdministrativeChoreographyIntent,
  renameAdministrativeChoreographyIntent,
  updateAdministrativeChoreographyRosterIntent,
  updateAdministrativeChoreographySubmodalityIntent,
  type AdministrativeChoreographyDeleteBlocker,
  type AdministrativeChoreographyViewActionData,
} from "./shared";
import { useAdministrativeRosterForm } from "./use-roster-form";
import type { AdministrativeChoreographyDetailLoaderData } from "./server";

type AdministracionCoreografiaDetalleRouteViewProps = {
  actionData?: AdministrativeChoreographyViewActionData;
  initialDeleteDialogOpen?: boolean;
  loaderData: AdministrativeChoreographyDetailLoaderData;
};

type AdministrativeChoreographyFormValues = z.input<
  typeof administrativeChoreographyFormSchema
>;

const administrativeChoreographyFormSchema = z.object({
  dancerIds: z.array(z.string()).min(1, requiredFieldMessage),
  experienceLevelId: z.string(),
  musicStorageKey: z.string(),
  name: z.string().trim().min(1, requiredFieldMessage),
  professorIds: z.array(z.string()),
  scheduleCapacityId: z.string(),
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
  actionData?: AdministrativeChoreographyViewActionData;
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
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const roster = useAdministrativeRosterForm({ form, loaderData });

  useEffect(() => {
    reset(defaultValues);
  }, [defaultValues, reset]);

  const showLevelSelect =
    roster.hasResolvedRosterChange &&
    roster.derivedResolution.experienceLevelRequired;
  const showScheduleSelect =
    roster.hasResolvedRosterChange &&
    roster.scheduleResolution?.status === "multiple";
  const noCompatibleCategory = hasNoCompatibleCategory({
    derivedResolution: roster.derivedResolution,
    hasResolvedRosterChange: roster.hasResolvedRosterChange,
  });

  const canSubmit =
    loaderData.canEdit &&
    canSubmitAdministrativeChoreographyEdit({
      canEditRoster: roster.canEditRoster,
      derivedResolution: roster.derivedResolution,
      hasNameChanged: roster.hasNameChanged,
      hasProfessorsChanged: roster.hasProfessorsChanged,
      hasRosterChanged: roster.hasRosterChanged,
      isResolving: roster.isResolving,
      isSubmitting: roster.isSubmitting,
      resolution: roster.resolution,
      resolvedSelectionKey: roster.resolvedSelectionKey,
      scheduleResolution: roster.scheduleResolution,
      selectionKey: roster.selectionKey,
      watchedDancerIds: roster.watchedDancerIds,
      watchedExperienceLevelId: roster.watchedExperienceLevelId,
      watchedScheduleCapacityId: roster.watchedScheduleCapacityId,
    });

  // Un rename aislado no toca el roster, así que evita el hard lock por
  // presentación que sí aplica a `update-roster`.
  const intent =
    roster.hasRosterChanged || roster.hasProfessorsChanged
      ? updateAdministrativeChoreographyRosterIntent
      : renameAdministrativeChoreographyIntent;

  const handleConfirm = form.handleSubmit((values) => {
    setIsConfirmOpen(false);

    const formData = new FormData();
    formData.set("intent", intent);
    formData.set("name", values.name);

    if (intent === updateAdministrativeChoreographyRosterIntent) {
      for (const dancerId of values.dancerIds) {
        formData.append("dancerIds", dancerId);
      }
      for (const professorId of values.professorIds) {
        formData.append("professorIds", professorId);
      }
      formData.set("experienceLevelId", values.experienceLevelId);
      formData.set("scheduleCapacityId", values.scheduleCapacityId);
    }

    submit(formData, { method: "post" });
  });

  return (
    <>
      <form
        method="post"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();

          if (canSubmit) {
            setIsConfirmOpen(true);
          }
        }}
      >
        <AdminResourceFormCard
          footer={
            <FormActions
              backToList={loaderData.backToList}
              canEdit={loaderData.canEdit}
              canSubmit={canSubmit}
              isPending={roster.isResolving || roster.isSubmitting}
            />
          }
        >
          {choreography.hasPresentation && loaderData.canEdit ? (
            <Alert>
              <AlertTitle>El roster está bloqueado</AlertTitle>
              <AlertDescription>
                Esta coreografía ya tiene una presentación asociada. Podés
                cambiar el nombre, pero no los bailarines ni los profesores.
              </AlertDescription>
            </Alert>
          ) : null}

          {noCompatibleCategory ? (
            <Alert variant="destructive">
              <AlertTitle>No hay categoría compatible</AlertTitle>
              <AlertDescription>
                Con este roster (
                {formatGroupTypeLabel(roster.derivedResolution.groupType)}) no
                existe una categoría válida. Ajustá los bailarines para poder
                guardar.
              </AlertDescription>
            </Alert>
          ) : null}

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
            <ReadOnlyField
              label="Modalidad"
              value={choreography.modalityName}
            />
            <SubmodalityField loaderData={loaderData} />
            <ReadOnlyField
              label="Categoría"
              value={roster.derivedResolution.categoryName ?? "Sin asignar"}
            />
            <ReadOnlyField
              label="Tipo de grupo"
              value={formatGroupTypeLabel(roster.derivedResolution.groupType)}
            />
            {showLevelSelect ? (
              <SelectField
                control={form.control}
                label="Nivel de experiencia"
                name="experienceLevelId"
                options={roster.derivedResolution.experienceLevelOptions.map(
                  (option) => ({ label: option.name, value: option.id }),
                )}
                placeholder="Elegí el nivel"
              />
            ) : (
              <ReadOnlyField
                label="Nivel de experiencia"
                value={choreography.experienceLevelName ?? ""}
              />
            )}
            {showScheduleSelect && roster.scheduleResolution ? (
              <SelectField
                control={form.control}
                label="Cronograma"
                name="scheduleCapacityId"
                options={roster.scheduleResolution.options.map((option) => ({
                  label: formatScheduleOptionLabel(option),
                  value: option.id,
                }))}
                placeholder="Elegí el cronograma"
              />
            ) : (
              <ReadOnlyField
                label="Cronograma"
                value={choreography.scheduleLabel}
              />
            )}
          </FieldGroup>

          <FieldGroup>
            <MultiComboboxField
              control={form.control}
              disabled={!roster.canEditRoster}
              emptyMessage="Sin bailarines disponibles"
              inputName="dancerIds"
              label="Bailarines"
              name="dancerIds"
              options={loaderData.availableDancers.map(toPersonOption)}
              placeholder="Buscar bailarines"
              searchable
            />

            <MultiComboboxField
              control={form.control}
              disabled={!roster.canEditRoster}
              emptyMessage="Sin profesores disponibles"
              inputName="professorIds"
              label="Profesores"
              name="professorIds"
              options={loaderData.availableProfessors.map(toPersonOption)}
              placeholder="Buscar profesores"
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

      <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar edición</AlertDialogTitle>
            <AlertDialogDescription>
              Vas a guardar los cambios de esta coreografía. Revisá que el
              roster sea correcto antes de confirmar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>
              Confirmar edición
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function SubmodalityField({
  loaderData,
}: {
  loaderData: AdministrativeChoreographyDetailLoaderData;
}) {
  const choreography = loaderData.choreography;
  const submit = useSubmit();
  const submodalityForm = useForm<{ submodalityId: string }>({
    defaultValues: { submodalityId: choreography.submodalityId ?? "" },
  });

  // Editable solo para `admin`, cuando la modalidad tiene submodalidades y la
  // coreografía todavía no tiene presentación. La modalidad es inmutable.
  const isEditable =
    loaderData.canEdit &&
    !choreography.hasPresentation &&
    loaderData.submodalityOptions.length > 0;

  if (!isEditable) {
    return (
      <ReadOnlyField
        label="Submodalidad"
        value={choreography.submodalityName ?? ""}
      />
    );
  }

  return (
    <SelectField
      control={submodalityForm.control}
      label="Submodalidad"
      name="submodalityId"
      onValueChange={(value) => {
        if (!value || value === (choreography.submodalityId ?? "")) {
          return;
        }

        const formData = new FormData();
        formData.set(
          "intent",
          updateAdministrativeChoreographySubmodalityIntent,
        );
        formData.set("submodalityId", value);
        submit(formData, { method: "post" });
      }}
      options={loaderData.submodalityOptions.map((option) => ({
        label: option.name,
        value: option.id,
      }))}
      placeholder="Elegí la submodalidad"
    />
  );
}

function FormActions({
  backToList,
  canEdit,
  canSubmit,
  isPending,
}: {
  backToList: string;
  canEdit: boolean;
  canSubmit: boolean;
  isPending: boolean;
}) {
  return (
    <>
      <Button asChild variant="outline">
        <Link to={backToList}>
          <ChevronLeft aria-hidden="true" data-icon="inline-start" />
          Volver
        </Link>
      </Button>
      {canEdit ? (
        <Button type="submit" disabled={!canSubmit}>
          {isPending ? (
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
  actionData?: AdministrativeChoreographyViewActionData,
): AdministrativeChoreographyFormValues {
  const choreography = loaderData.choreography;

  return {
    dancerIds: choreography.dancers.map((dancer) => dancer.id),
    experienceLevelId: choreography.experienceLevelId ?? "",
    musicStorageKey: choreography.musicStorageKey ?? "",
    name:
      (actionData && "values" in actionData
        ? actionData.values.name
        : undefined) ?? choreography.name,
    professorIds: choreography.professors.map((professor) => professor.id),
    scheduleCapacityId: "",
  };
}

function formatScheduleOptionLabel(option: {
  schedule: { name: string; scheduledDate?: string; startTime?: string };
}) {
  const { name, scheduledDate, startTime } = option.schedule;

  if (!scheduledDate || !startTime) {
    return name;
  }

  const [year, month, day] = scheduledDate.split("-").map(Number);

  if (!year || !month || !day) {
    return name;
  }

  const formattedDate = new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, day));

  return `${formattedDate} - ${startTime.slice(0, 5)} hs.`;
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

import { zodResolver } from "@hookform/resolvers/zod";
import { Check, ChevronLeft, LoaderCircle, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSubmit } from "react-router";
import { useForm, type Control } from "react-hook-form";
import { z } from "zod";

import {
  AdminResourceFormCard,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { DeleteDialog } from "@/components/shared/delete-dialog";
import { FileUploadField } from "@/components/shared/file-upload-field";
import { getAssetKindHelperText } from "@/lib/storage/asset-kinds";
import { MultiComboboxField } from "@/components/shared/multi-combobox-field";
import { ReadOnlyField } from "@/components/shared/read-only-field";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { SelectField } from "@/components/shared/select-field";
import { TextInputField } from "@/components/shared/text-input-field";
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
import { formatScheduleDateTime } from "@/lib/choreographies/schedule-formatters";
import { formatGroupTypeLabel } from "@/lib/portal/choreographies";
import { requiredFieldMessage } from "@/lib/shared/forms";
import { useServerActionToast } from "@/lib/shared/toasts";

import { ChoreographyDetailAlerts } from "./detail-alerts";
import {
  ModalityCorrectionActions,
  ModalityExperienceLevelField,
  ModalityField,
  ModalityScheduleCapacityField,
  ModalitySubmodalityField,
} from "./modality-fields";
import {
  canSubmitChoreographyEdit,
  getExperienceLevelSlotState,
  getWithdrawnDancers,
  hasNoCompatibleCategory,
  shouldRenderRosterScheduleSelect,
} from "./roster-form-state";
import {
  deleteChoreographyIntent,
  renameChoreographyIntent,
  updateChoreographyRosterIntent,
  type ChoreographyDeleteBlocker,
  type ChoreographyViewActionData,
} from "./shared";
import {
  ExperienceLevelField,
  ScheduleCapacityField,
  SubmodalityField,
} from "./reassignment-fields";
import { useModalityForm } from "./use-modality-form";
import { useRosterForm } from "./use-roster-form";
import type { ChoreographyDetailLoaderData } from "./server";

type ChoreographyDetailRouteViewProps = {
  actionData?: ChoreographyViewActionData;
  initialDeleteDialogOpen?: boolean;
  loaderData: ChoreographyDetailLoaderData;
};

type ChoreographyFormValues = z.input<typeof choreographyFormSchema>;

const choreographyFormSchema = z.object({
  dancerIds: z.array(z.string()).min(1, requiredFieldMessage),
  experienceLevelId: z.string(),
  musicStorageKey: z.string(),
  name: z.string().trim().min(1, requiredFieldMessage),
  professorIds: z.array(z.string()),
  scheduleCapacityId: z.string(),
});

export function ChoreographyDetailRouteView({
  actionData,
  initialDeleteDialogOpen = false,
  loaderData,
}: ChoreographyDetailRouteViewProps) {
  const errorData = actionData?.status === "error" ? actionData : undefined;
  const successData = actionData?.status === "success" ? actionData : undefined;

  useServerActionToast(errorData, {
    toastId: "admin-choreography-detail:error",
  });
  useServerActionToast(successData, {
    toastId: "admin-choreography-detail:success",
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
      <ChoreographyDetailForm actionData={actionData} loaderData={loaderData} />

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
          intentValue={deleteChoreographyIntent}
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

function ChoreographyDetailForm({
  actionData,
  loaderData,
}: {
  actionData?: ChoreographyViewActionData;
  loaderData: ChoreographyDetailLoaderData;
}) {
  const choreography = loaderData.choreography;
  const defaultValues = useMemo(
    () => getChoreographyFormValues(loaderData, actionData),
    [actionData, loaderData],
  );
  const form = useForm<ChoreographyFormValues>({
    defaultValues,
    mode: "onSubmit",
    resolver: zodResolver(choreographyFormSchema),
  });
  const { reset } = form;
  const submit = useSubmit();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const roster = useRosterForm({ form, loaderData });
  // Los dos forms se excluyen en pantalla: mientras uno tiene cambios sin
  // guardar el otro queda de solo lectura, porque la misma resolución
  // reescribiría los mismos campos derivados desde dos lados.
  const isRosterFormDirty =
    roster.hasNameChanged ||
    roster.hasRosterChanged ||
    roster.hasProfessorsChanged;
  const modality = useModalityForm({ isRosterFormDirty, loaderData });

  useEffect(() => {
    reset(defaultValues);
  }, [defaultValues, reset]);

  const experienceLevelSlot = getExperienceLevelSlotState({
    choreography,
    derivedResolution: roster.derivedResolution,
    hasResolvedRosterChange: roster.hasResolvedRosterChange,
  });
  const showScheduleSelect = shouldRenderRosterScheduleSelect({
    hasResolvedRosterChange: roster.hasResolvedRosterChange,
    scheduleResolution: roster.scheduleResolution,
  });
  const noCompatibleCategory = hasNoCompatibleCategory({
    derivedResolution: roster.derivedResolution,
    hasResolvedRosterChange: roster.hasResolvedRosterChange,
  });

  const canSubmit =
    loaderData.canEdit &&
    !modality.isDirty &&
    canSubmitChoreographyEdit({
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
      showRosterExperienceLevelSelect: experienceLevelSlot.showRosterSelect,
      watchedDancerIds: roster.watchedDancerIds,
      watchedExperienceLevelId: roster.watchedExperienceLevelId,
      watchedScheduleCapacityId: roster.watchedScheduleCapacityId,
    });

  // Un rename aislado no toca el roster, así que evita el hard lock por
  // presentación que sí aplica a `update-roster`.
  const intent =
    roster.hasRosterChanged || roster.hasProfessorsChanged
      ? updateChoreographyRosterIntent
      : renameChoreographyIntent;

  const withdrawnDancers = getWithdrawnDancers({
    dancers: choreography.dancers,
    watchedDancerIds: roster.watchedDancerIds,
  });

  const handleConfirm = form.handleSubmit((values) => {
    setIsConfirmOpen(false);

    const formData = new FormData();
    formData.set("intent", intent);
    formData.set("name", values.name);

    if (intent === updateChoreographyRosterIntent) {
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
          <ChoreographyDetailAlerts
            groupType={roster.derivedResolution.groupType}
            loaderData={loaderData}
            noCompatibleCategory={noCompatibleCategory}
          />

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
                disabled={modality.isDirty}
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
            <ModalityField loaderData={loaderData} modality={modality} />
            {/* Un solo slot por campo dependiente y una precedencia fija: la
                corrección de modalidad manda mientras está pendiente, porque su
                resolución reescribe los tres a la vez. El form del roster y el
                bloque de modalidad se excluyen entre sí, así que nunca hay dos
                candidatos para el mismo slot. */}
            {modality.isDirty ? (
              <ModalitySubmodalityField
                loaderData={loaderData}
                modality={modality}
              />
            ) : (
              <SubmodalityField loaderData={loaderData} />
            )}
            <ReadOnlyField
              label="Categoría"
              value={
                modality.categoryLabel ??
                roster.derivedResolution.categoryName ??
                "Sin asignar"
              }
            />
            <ReadOnlyField
              label="Tipo de grupo"
              value={formatGroupTypeLabel(roster.derivedResolution.groupType)}
            />
            {/* Un solo slot "Nivel de experiencia": la corrección de modalidad
                manda mientras está pendiente; después, el select del roster
                cuando el cambio pendiente mueve la categoría, porque el nivel
                nuevo se elige junto con la confirmación. Ver
                `getExperienceLevelSlotState`. */}
            {modality.isDirty ? (
              <ModalityExperienceLevelField
                loaderData={loaderData}
                modality={modality}
              />
            ) : (
              <RosterExperienceLevelSlot
                control={form.control}
                experienceLevelSlot={experienceLevelSlot}
                loaderData={loaderData}
                options={roster.derivedResolution.experienceLevelOptions}
              />
            )}
            {/* Un solo slot "Cronograma" con precedencia fija: manda la
                corrección de modalidad mientras está pendiente; después, el
                select del roster, porque un cambio de tipo de grupo limpia el
                cupo y el reemplazo se elige junto con la confirmación. */}
            {modality.isDirty ? (
              <ModalityScheduleCapacityField
                loaderData={loaderData}
                modality={modality}
              />
            ) : (
              <RosterScheduleSlot
                control={form.control}
                loaderData={loaderData}
                scheduleResolution={
                  showScheduleSelect ? roster.scheduleResolution : null
                }
              />
            )}
            <ModalityCorrectionActions modality={modality} />
          </FieldGroup>

          <FieldGroup>
            <MultiComboboxField
              control={form.control}
              disabled={!roster.canEditRoster || modality.isDirty}
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
              disabled={!roster.canEditRoster || modality.isDirty}
              emptyMessage="Sin profesores disponibles"
              inputName="professorIds"
              label="Profesores"
              name="professorIds"
              options={loaderData.availableProfessors.map(toPersonOption)}
              placeholder="Buscar profesores"
              searchable
            />

            {/* Download-only: the validation props a disabled input cannot act
                on are deliberately absent (#571). */}
            <FileUploadField
              control={form.control}
              disabled
              downloadLabel="Descargar música"
              downloadUrl={choreography.musicDownloadUrl}
              fieldLabel="Archivo de música"
              fileInputName="musicFile"
              helperText={getAssetKindHelperText("choreographyMusic")}
              label="No hay música cargada"
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
          {withdrawnDancers.length > 0 ? (
            <WithdrawalConsequences dancers={withdrawnDancers} />
          ) : null}
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

/**
 * El slot del nivel cuando la corrección de modalidad no lo reclama: el select
 * del roster si el cambio pendiente mueve la categoría, y si no la reasignación
 * autónoma.
 */
function RosterExperienceLevelSlot({
  control,
  experienceLevelSlot,
  loaderData,
  options,
}: {
  control: Control<ChoreographyFormValues>;
  experienceLevelSlot: ReturnType<typeof getExperienceLevelSlotState>;
  loaderData: ChoreographyDetailLoaderData;
  options: Array<{ id: string; name: string }>;
}) {
  if (experienceLevelSlot.showRosterSelect) {
    return (
      <SelectField
        control={control}
        label="Nivel de experiencia"
        name="experienceLevelId"
        options={options.map((option) => ({
          label: option.name,
          value: option.id,
        }))}
        placeholder="Elegí el nivel"
      />
    );
  }

  return (
    <ExperienceLevelField
      experienceLevelId={experienceLevelSlot.experienceLevelId}
      loaderData={loaderData}
      requiresExperienceLevel={experienceLevelSlot.requiresExperienceLevel}
    />
  );
}

/**
 * El slot del cronograma cuando la corrección de modalidad no lo reclama.
 */
function RosterScheduleSlot({
  control,
  loaderData,
  scheduleResolution,
}: {
  control: Control<ChoreographyFormValues>;
  loaderData: ChoreographyDetailLoaderData;
  scheduleResolution: ReturnType<typeof useRosterForm>["scheduleResolution"];
}) {
  if (!scheduleResolution || scheduleResolution.status !== "multiple") {
    return <ScheduleCapacityField loaderData={loaderData} />;
  }

  return (
    <SelectField
      control={control}
      label="Cronograma"
      name="scheduleCapacityId"
      options={scheduleResolution.options.map((option) => ({
        label: formatScheduleDateTime(option.schedule),
        value: option.id,
      }))}
      placeholder="Elegí el cronograma"
    />
  );
}

/**
 * La baja de un bailarín con plata asignada o con una línea de comprobante no
 * borra la inscripción: la retira. El diálogo enumera esa consecuencia solo
 * cuando hay evidencia; sin ella la baja es un borrado y no hay nada que
 * advertir.
 */
function WithdrawalConsequences({
  dancers,
}: {
  dancers: Array<{ id: string; name: string }>;
}) {
  return (
    <div className="text-sm text-muted-foreground">
      <p>
        {dancers.length === 1
          ? "Esta inscripción tiene plata asignada o un comprobante emitido, así que no se borra: queda retirada."
          : "Estas inscripciones tienen plata asignada o un comprobante emitido, así que no se borran: quedan retiradas."}
      </p>
      <ul className="mt-2 list-disc pl-5">
        {dancers.map((dancer) => (
          <li key={dancer.id}>{dancer.name}</li>
        ))}
      </ul>
      <p className="mt-2">
        Conservan la plata que tienen asignada y siguen en el comprobante.
        Volver a agregar al bailarín las reactiva.
      </p>
    </div>
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

function getChoreographyFormValues(
  loaderData: ChoreographyDetailLoaderData,
  actionData?: ChoreographyViewActionData,
): ChoreographyFormValues {
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
  blockers: ChoreographyDeleteBlocker[];
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

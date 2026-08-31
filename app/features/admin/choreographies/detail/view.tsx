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
import { getAssetKindHelperText } from "@/lib/storage/asset-kinds";
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
import { toScheduleCapacitySelectOptions } from "@/lib/choreographies/schedule-capacity-options";
import { formatGroupTypeLabel } from "@/lib/portal/choreographies";
import { requiredFieldMessage } from "@/lib/shared/forms";
import { useServerActionToast } from "@/lib/shared/toasts";

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
          {choreography.hasPresentation && loaderData.canEdit ? (
            <Alert>
              <AlertTitle>La presentación bloquea esta coreografía</AlertTitle>
              <AlertDescription>
                Esta coreografía ya tiene una presentación asociada. Podés
                cambiar el nombre, pero no los bailarines, los profesores, la
                submodalidad, el cupo de cronograma ni el nivel de experiencia.
              </AlertDescription>
            </Alert>
          ) : null}

          {/* Tampoco se suprime para el auditor: informa un estado de los datos.
              La coreografía quedó sin un nivel que su categoría exige —por una
              corrección de fecha de nacimiento, por una categoría a la que le
              agregaron niveles después, o por una fila vieja—, y el motivo no
              está guardado en ningún lado, así que la alerta no lo nombra. */}
          {choreography.operationalStatus.pendingItems.includes(
            "experienceLevel",
          ) ? (
            <Alert>
              <AlertTitle>Falta el nivel de experiencia</AlertTitle>
              <AlertDescription>
                Esta coreografía no tiene nivel de experiencia y su categoría lo
                requiere.
                {loaderData.experienceLevel.canReassign
                  ? " Elegí uno para completarla."
                  : ""}
              </AlertDescription>
            </Alert>
          ) : null}

          {/* La alerta financiera no se suprime para el auditor: el motivo del
              bloqueo es información de la coreografía, no del permiso de quien
              mira. */}
          {loaderData.scheduleCapacity.blockers.length > 0 ? (
            <Alert>
              <AlertTitle>El cupo de cronograma está bloqueado</AlertTitle>
              <AlertDescription>
                <p>No se puede reasignar el cupo de cronograma:</p>
                <ul className="mt-2 list-disc pl-5">
                  {loaderData.scheduleCapacity.blockers.map((blocker) => (
                    <li key={blocker.code}>{blocker.label}</li>
                  ))}
                </ul>
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
            {/* Un solo slot "Nivel de experiencia": el select del roster manda
                cuando el cambio pendiente mueve la categoría, porque el nivel
                nuevo se elige junto con la confirmación. Ver
                `getExperienceLevelSlotState`. */}
            {experienceLevelSlot.showRosterSelect ? (
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
              <ExperienceLevelField
                experienceLevelId={experienceLevelSlot.experienceLevelId}
                loaderData={loaderData}
                requiresExperienceLevel={
                  experienceLevelSlot.requiresExperienceLevel
                }
              />
            )}
            {/* Un solo slot "Cronograma" con precedencia fija: mientras hay un
                cambio de roster pendiente manda el select del roster, porque un
                cambio de tipo de grupo limpia el cupo y el reemplazo se elige
                junto con la confirmación. */}
            {showScheduleSelect &&
            roster.scheduleResolution?.status === "multiple" ? (
              <SelectField
                control={form.control}
                label="Cronograma"
                name="scheduleCapacityId"
                options={toScheduleCapacitySelectOptions(
                  roster.scheduleResolution.options,
                )}
                placeholder="Elegí el cronograma"
              />
            ) : (
              <ScheduleCapacityField loaderData={loaderData} />
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

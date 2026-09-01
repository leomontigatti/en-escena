import { zodResolver } from "@hookform/resolvers/zod";
import { Check, ChevronLeft, LoaderCircle, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSubmit } from "react-router";
import { useForm } from "react-hook-form";

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
import { formatGroupTypeLabel } from "@/lib/portal/choreographies";
import { useServerActionToast } from "@/lib/shared/toasts";

import { ChoreographyDetailAlerts } from "./detail-alerts";
import {
  DependentFieldSlot,
  ModalityExperienceLevelField,
  ModalityField,
  ModalityScheduleCapacityField,
  ModalitySubmodalityField,
} from "./modality-fields";
import { canSubmitModalityCorrection } from "./modality-form-state";
import {
  choreographyFormSchema,
  RosterExperienceLevelSlot,
  RosterScheduleSlot,
  type ChoreographyFormValues,
} from "./roster-fields";
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
import { SubmodalityField } from "./reassignment-fields";
import { useModalityForm } from "./use-modality-form";
import { useRosterForm } from "./use-roster-form";
import type { ChoreographyDetailLoaderData } from "./server";

type ChoreographyDetailRouteViewProps = {
  actionData?: ChoreographyViewActionData;
  initialDeleteDialogOpen?: boolean;
  loaderData: ChoreographyDetailLoaderData;
};

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
  // The two forms exclude each other on screen: while one has unsaved changes
  // the other goes read-only, because the same resolution would rewrite the
  // same derived fields from two sides.
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

  // One `Guardar` in the footer for both forms. They exclude each other on
  // screen, so the pending correction decides what the button submits: the
  // modality one writes on its own, the roster one still confirms first.
  const canSubmitModality = canSubmitModalityCorrection(modality);
  const canSubmitRoster =
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

          // The modality correction writes on its own: the confirmation
          // dialog enumerates roster consequences it does not have.
          if (modality.isDirty) {
            modality.save();
            return;
          }

          if (canSubmitRoster) {
            setIsConfirmOpen(true);
          }
        }}
      >
        <AdminResourceFormCard
          footer={
            <FormActions
              backToList={loaderData.backToList}
              canEdit={loaderData.canEdit}
              canSubmit={modality.isDirty ? canSubmitModality : canSubmitRoster}
              isPending={
                modality.isDirty
                  ? modality.isResolving || modality.isSubmitting
                  : roster.isResolving || roster.isSubmitting
              }
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
            <DependentFieldSlot
              modality={modality}
              resolved={(resolution) => (
                <ModalitySubmodalityField
                  modality={modality}
                  resolution={resolution}
                />
              )}
              saved={(disabled) => (
                <SubmodalityField disabled={disabled} loaderData={loaderData} />
              )}
            />
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
            {/* Which roster control fills this slot when the correction is
                not pending is its own rule: see `getExperienceLevelSlotState`. */}
            <DependentFieldSlot
              modality={modality}
              resolved={(resolution) => (
                <ModalityExperienceLevelField
                  modality={modality}
                  resolution={resolution}
                />
              )}
              saved={(disabled) => (
                <RosterExperienceLevelSlot
                  control={form.control}
                  disabled={disabled}
                  experienceLevelSlot={experienceLevelSlot}
                  loaderData={loaderData}
                  options={roster.derivedResolution.experienceLevelOptions}
                />
              )}
            />
            {/* Without a pending correction the roster select takes over: a
                tipo de grupo change clears the cupo and the replacement is
                chosen together with the confirmation. */}
            <DependentFieldSlot
              modality={modality}
              resolved={(resolution) => (
                <ModalityScheduleCapacityField
                  modality={modality}
                  resolution={resolution}
                />
              )}
              saved={(disabled) => (
                <RosterScheduleSlot
                  control={form.control}
                  disabled={disabled}
                  loaderData={loaderData}
                  scheduleResolution={
                    showScheduleSelect ? roster.scheduleResolution : null
                  }
                />
              )}
            />
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

      <ConfirmEditDialog
        onConfirm={handleConfirm}
        onOpenChange={setIsConfirmOpen}
        open={isConfirmOpen}
        withdrawnDancers={withdrawnDancers}
      />
    </>
  );
}

/**
 * The roster save confirms first: unlike the modality correction, it can retire
 * inscriptions, and the dialog is where that consequence is enumerated.
 */
function ConfirmEditDialog({
  onConfirm,
  onOpenChange,
  open,
  withdrawnDancers,
}: {
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  withdrawnDancers: Array<{ id: string; name: string }>;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirmar edición</AlertDialogTitle>
          <AlertDialogDescription>
            Vas a guardar los cambios de esta coreografía. Revisá que el elenco
            sea correcto antes de confirmar.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {withdrawnDancers.length > 0 ? (
          <WithdrawalConsequences dancers={withdrawnDancers} />
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            Confirmar edición
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Removing a dancer who holds allocated money or a comprobante line does not
 * delete the inscription: it withdraws it. The dialog spells that consequence
 * out only when there is evidence; without it the removal is a delete and
 * there is nothing to warn about.
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
          ? "Esta inscripción tiene dinero asignado o un comprobante emitido, así que no se borra: queda retirada."
          : "Estas inscripciones tienen dinero asignado o un comprobante emitido, así que no se borran: quedan retiradas."}
      </p>
      <ul className="mt-2 list-disc pl-5">
        {dancers.map((dancer) => (
          <li key={dancer.id}>{dancer.name}</li>
        ))}
      </ul>
      <p className="mt-2">
        Conservan el dinero que tienen asignado y siguen en el comprobante.
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

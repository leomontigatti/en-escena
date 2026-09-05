import { Check, ChevronLeft, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useSubmit } from "react-router";

import {
  AdminResourceFormCard,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { DeleteDialog } from "@/components/shared/delete-dialog";
import { formatEventSequenceNumber } from "@/lib/events/sequence-number";
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
import { Spinner } from "@/components/ui/spinner";
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
import { RosterExperienceLevelSlot, RosterScheduleSlot } from "./roster-fields";
import { getWithdrawnDancers } from "./roster-form-state";
import {
  deleteChoreographyIntent,
  updateChoreographyRosterIntent,
  type ChoreographyDeleteBlocker,
  type ChoreographyViewActionData,
} from "./shared";
import { SubmodalityField } from "./reassignment-fields";
import { useChoreographyDetailForms } from "./use-choreography-detail-forms";
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
      title={`Detalle coreografía # ${formatEventSequenceNumber(
        loaderData.choreography.choreographyNumber,
      )}`}
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
  const {
    canSubmitRoster,
    experienceLevelSlot,
    footer,
    form,
    hasPendingScheduleCapacity,
    intent,
    isRosterEditDisabled,
    modality,
    noCompatibleCategory,
    pendingSave,
    roster,
    rosterScheduleOptions,
    scheduleCapacity,
  } = useChoreographyDetailForms({ actionData, loaderData });
  const submit = useSubmit();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

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
      <ChoreographyDetailAlerts
        groupType={roster.derivedResolution.groupType}
        loaderData={loaderData}
        noCompatibleCategory={noCompatibleCategory}
      />

      <form
        method="post"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();

          // The modality correction and the capacity reassignment write on
          // their own: the confirmation dialog enumerates roster consequences
          // neither of them has.
          if (pendingSave === "modality") {
            modality.save();
            return;
          }

          if (pendingSave === "schedule-capacity") {
            scheduleCapacity.save();
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
              canSubmit={footer.canSubmit}
              isPending={footer.isPending}
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
                disabled={isRosterEditDisabled}
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
                  disabled={disabled || hasPendingScheduleCapacity}
                  experienceLevelSlot={experienceLevelSlot}
                  loaderData={loaderData}
                  options={roster.derivedResolution.experienceLevelOptions}
                />
              )}
            />
            {/* Without a pending correction the roster select takes over: a
                group type change clears the capacity and the replacement is
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
                  options={rosterScheduleOptions}
                  scheduleCapacity={scheduleCapacity}
                />
              )}
            />
          </FieldGroup>

          <FieldGroup>
            <MultiComboboxField
              control={form.control}
              disabled={!roster.canEditRoster || isRosterEditDisabled}
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
              disabled={!roster.canEditRoster || isRosterEditDisabled}
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
            <Spinner aria-hidden="true" data-icon="inline-start" />
          ) : (
            <Check aria-hidden="true" data-icon="inline-start" />
          )}
          Guardar
        </Button>
      ) : null}
    </>
  );
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

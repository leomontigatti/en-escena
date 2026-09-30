import { RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useSubmit } from "react-router";

import { AdminResourceLayout } from "@/components/admin/resource-layout";
import { DeleteDialog } from "@/components/shared/delete-dialog";
import { FileUploadField } from "@/components/shared/file-upload-field";
import { FormActions } from "@/components/shared/form-actions";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
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
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { FieldGroup } from "@/components/ui/field";
import { formatEventSequenceNumber } from "@/lib/events/sequence-number";
import { useServerActionToast } from "@/lib/shared/toasts";
import { getAssetKindHelperText } from "@/lib/storage/asset-kinds";

import { ChoreographyDetailAlerts } from "./detail-alerts";
import { ConfirmDraftDialog } from "./draft-confirm-dialog";
import {
  ChoreographyClassificationFields,
  ChoreographyPeopleFields,
} from "./draft-fields";
import type { ChoreographyDetailLoaderData } from "./server";
import {
  deleteChoreographyIntent,
  formatChoreographyRemovalDescription,
  restoreChoreographyDescription,
  restoreChoreographyIntent,
  type ChoreographyDeleteBlocker,
  type ChoreographyViewActionData,
} from "./shared";
import { useChoreographyDraft } from "./use-choreography-draft";

type ChoreographyDetailRouteViewProps = {
  actionData?: ChoreographyViewActionData;
  initialDeleteDialogOpen?: boolean;
  initialRestoreDialogOpen?: boolean;
  loaderData: ChoreographyDetailLoaderData;
};

export function ChoreographyDetailRouteView({
  actionData,
  initialDeleteDialogOpen = false,
  initialRestoreDialogOpen = false,
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
  const [isRestoreDialogOpen, setIsRestoreDialogOpen] = useState(
    initialRestoreDialogOpen,
  );

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      requireSelectedEvent={false}
      title={`Detalle coreografía # ${formatEventSequenceNumber(
        loaderData.choreography.choreographyNumber,
      )}`}
      description="Revisá y/o modificá la información y el elenco de la coreografía registrada."
      headerAction={
        // The menu survives the withdrawal even though `canEdit` does not: it
        // is where `Restaurar coreografía` lives, the one action left.
        loaderData.canEdit || loaderData.restoration.canRestore ? (
          <ChoreographyDetailActionsMenu
            canDelete={loaderData.deletion.canDelete}
            canRestore={loaderData.restoration.canRestore}
            onDelete={() => setIsDeleteDialogOpen(true)}
            onRestore={() => setIsRestoreDialogOpen(true)}
          />
        ) : null
      }
    >
      <ChoreographyDetailForm loaderData={loaderData} />

      {loaderData.restoration.canRestore ? (
        <RestoreChoreographyDialog
          choreographyId={loaderData.choreography.id}
          onOpenChange={setIsRestoreDialogOpen}
          open={isRestoreDialogOpen}
        />
      ) : null}

      {loaderData.canEdit && !loaderData.restoration.canRestore ? (
        <ChoreographyRemovalDialog
          loaderData={loaderData}
          onOpenChange={setIsDeleteDialogOpen}
          open={isDeleteDialogOpen}
        />
      ) : null}
    </AdminResourceLayout>
  );
}

/**
 * The header offers one of the two removal-axis actions, never both: a withdrawn
 * choreography is not removed again —there is no second outcome left for it— and
 * one that is taking part has nothing to restore. A blocked removal is disabled
 * on sight, and the page alert says why.
 */
function ChoreographyDetailActionsMenu({
  canDelete,
  canRestore,
  onDelete,
  onRestore,
}: {
  canDelete: boolean;
  canRestore: boolean;
  onDelete: () => void;
  onRestore: () => void;
}) {
  return (
    <ResourceActionsMenu contentClassName="w-52">
      <DropdownMenuGroup>
        {canRestore ? (
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              onRestore();
            }}
          >
            <RotateCcw aria-hidden="true" />
            Restaurar coreografía
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            variant="destructive"
            disabled={!canDelete}
            onSelect={(event) => {
              event.preventDefault();
              onDelete();
            }}
          >
            <Trash2 aria-hidden="true" />
            Eliminar coreografía
          </DropdownMenuItem>
        )}
      </DropdownMenuGroup>
    </ResourceActionsMenu>
  );
}

/**
 * `Eliminar coreografía` is one action with two outcomes, and the dialog names
 * the one that will happen before the admin confirms. The evaluated presentation
 * is the only thing that blocks it; the menu item is then disabled, so the
 * blocked dialog is only reached from the URL, and it explains itself instead
 * of offering the button.
 */
function ChoreographyRemovalDialog({
  loaderData,
  onOpenChange,
  open,
}: {
  loaderData: ChoreographyDetailLoaderData;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  return (
    <DeleteDialog
      blockedDescription={
        loaderData.deletion.canDelete ? undefined : (
          <BlockedDeleteReasons blockers={loaderData.deletion.blockers} />
        )
      }
      blockedTitle="No se puede eliminar esta coreografía"
      description={
        loaderData.deletion.canDelete
          ? formatChoreographyRemovalDescription({
              outcome: loaderData.deletion.outcome,
              presentationOrderNumber:
                loaderData.choreography.presentationOrderNumber,
            })
          : // The reason itself is left to `BlockedDeleteReasons`, which lists it
            // right below: saying it here as well reads as two findings and not
            // as one.
            "Esta coreografía no puede eliminarse ni retirarse: la historia competitiva no se pierde."
      }
      intentValue={deleteChoreographyIntent}
      isBlocked={!loaderData.deletion.canDelete}
      onOpenChange={onOpenChange}
      open={open}
      recordId={loaderData.choreography.id}
      title="Eliminar coreografía"
    />
  );
}

/**
 * `Restaurar coreografía` is confirmed like every other correction that changes
 * what the lists show, and it is submitted as an ordinary intent: the place in
 * the schedule is asked for again on the server, so the refusal it may bring
 * back arrives by toast rather than being predicted here.
 */
function RestoreChoreographyDialog({
  choreographyId,
  onOpenChange,
  open,
}: {
  choreographyId: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const submit = useSubmit();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Restaurar coreografía</AlertDialogTitle>
          <AlertDialogDescription>
            {restoreChoreographyDescription}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              onOpenChange(false);

              const formData = new FormData();
              formData.set("intent", restoreChoreographyIntent);
              formData.set("recordId", choreographyId);

              void submit(formData, { method: "post" });
            }}
          >
            Restaurar coreografía
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * The detail as one form with one draft and one `Guardar`: nothing writes until
 * it is pressed, and it writes everything together.
 */
function ChoreographyDetailForm({
  loaderData,
}: {
  loaderData: ChoreographyDetailLoaderData;
}) {
  const draft = useChoreographyDraft(loaderData);

  return (
    <>
      <ChoreographyDetailAlerts loaderData={loaderData} />

      <form
        method="post"
        noValidate
        className="flex flex-1 flex-col gap-6"
        onSubmit={(event) => void draft.requestSave(event)}
      >
        <Card>
          <CardContent className="flex flex-col gap-6">
            <FieldGroup className="grid gap-5 md:grid-cols-2">
              <ChoreographyClassificationFields
                draft={draft}
                loaderData={loaderData}
              />
            </FieldGroup>
            <ChoreographyPeopleFields draft={draft} loaderData={loaderData} />
            <ChoreographyMusicField loaderData={loaderData} />
          </CardContent>
        </Card>

        <FormActions
          backTo={loaderData.backToList}
          canEdit={loaderData.canEdit}
          canSave={draft.canSave}
          hasChanges={draft.isDirty}
          isPending={draft.isSaving}
          onDiscard={draft.discard}
        />
      </form>

      <ConfirmDraftDialog
        consequences={draft.preview.current?.consequences ?? null}
        {...draft.confirm}
      />
    </>
  );
}

/**
 * Download and listen only: the music is the academy's to upload, from the
 * portal. The validation props a disabled input cannot act on are deliberately
 * absent (#571).
 */
function ChoreographyMusicField({
  loaderData,
}: {
  loaderData: ChoreographyDetailLoaderData;
}) {
  const { choreography } = loaderData;
  const form = useForm({
    values: { musicStorageKey: choreography.musicStorageKey ?? "" },
  });

  return (
    <FileUploadField
      control={form.control}
      disabled
      downloadLabel="Descargar música"
      downloadUrl={choreography.musicDownloadUrl}
      existingPreviewUrl={choreography.musicDownloadUrl}
      fieldLabel="Archivo de música"
      fileInputName="musicFile"
      helperText={getAssetKindHelperText("choreographyMusic")}
      label="No hay música cargada"
      name="musicStorageKey"
      previewKind="audio"
      previewSelectedFile={false}
      removeLabel="Borrar música"
      uploadedLabel="Archivo de música cargado"
      variant="compact"
    />
  );
}

function BlockedDeleteReasons({
  blockers,
}: {
  blockers: ChoreographyDeleteBlocker[];
}) {
  return (
    <div>
      <p>{blockers.length === 1 ? "Motivo:" : "Motivos:"}</p>
      <ul className="mt-2 list-disc pl-5">
        {blockers.map((blocker) => (
          <li key={blocker.code}>{blocker.label}</li>
        ))}
      </ul>
    </div>
  );
}

import { useState, type ReactNode } from "react";

import { AdminResourceLayout } from "@/components/admin/resource-layout";
import { DestroyButton } from "@/components/shared/action-buttons";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { useServerActionToast } from "@/lib/shared/toasts";

import {
  getModalitySubmittedValues,
  ModalityForm,
  ModalityFormActions,
  ModalityFormPanel,
} from "../form";
import type {
  AdministrativeEventModalitiesLoaderData,
  AdministrativeEventModalityActionData,
  EventModalityRow,
} from "../shared";

export type AdministrativeEventModalityDetailViewProps = {
  loaderData: AdministrativeEventModalitiesLoaderData;
  actionData?: AdministrativeEventModalityActionData;
  modalityId: string;
};

export function AdministrativeEventModalityDetailView({
  loaderData,
  actionData,
  modalityId,
}: AdministrativeEventModalityDetailViewProps) {
  useServerActionToast(actionData);

  const modality = loaderData.modalities.find(
    (record) => record.id === modalityId,
  );
  const modalitySubmodalities = loaderData.submodalities.filter(
    (submodality) => submodality.modalityId === modalityId,
  );

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title={modality ? "Editar modalidad" : "Modalidad no encontrada"}
      description={
        modality
          ? "Editá la modalidad y gestioná sus submodalidades."
          : "No encontramos esa modalidad dentro del evento activo."
      }
      headerAction={modality ? <ModalityActions modality={modality} /> : null}
    >
      {modality ? (
        <ModalityFormPanel>
          <ModalityForm
            formId="update-modality-form"
            id={modality.id}
            intent="update-modality"
            name={modality.name}
            submodalities={modalitySubmodalities}
            submittedValues={getModalitySubmittedValues(
              actionData,
              modality.id,
            )}
          />
          <ModalityFormActions
            formId="update-modality-form"
            pendingScope={{
              intent: "update-modality",
              fields: { id: modality.id },
            }}
          />
        </ModalityFormPanel>
      ) : (
        <EmptyResourceState>No encontramos esa modalidad.</EmptyResourceState>
      )}
    </AdminResourceLayout>
  );
}

function ModalityActions({ modality }: { modality: EventModalityRow }) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  return (
    <>
      <ResourceActionsMenu contentClassName="w-48" size="icon-sm">
        <DropdownMenuGroup>
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setDeleteDialogOpen(true)}
          >
            Eliminar
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </ResourceActionsMenu>
      <DeleteModalityDialog
        modality={modality}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      />
    </>
  );
}

function DeleteModalityDialog({
  modality,
  open,
  onOpenChange,
}: {
  modality: EventModalityRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Eliminar modalidad</DialogTitle>
          <DialogDescription>
            Esta acción borra {modality.name} si no tiene submodalidades,
            categorías o cronogramas relacionados. No se puede deshacer.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-row justify-between sm:justify-between">
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancelar
            </Button>
          </DialogClose>
          <form method="post">
            <input type="hidden" name="intent" value="delete-modality" />
            <input type="hidden" name="id" value={modality.id} />
            <input type="hidden" name="confirmDeletion" value={modality.id} />
            <DestroyButton />
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmptyResourceState({ children }: { children: ReactNode }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>Sin datos</EmptyTitle>
        <EmptyDescription>{children}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

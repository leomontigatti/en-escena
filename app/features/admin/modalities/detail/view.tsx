import { useState, type ReactNode } from "react";

import { AdminResourceLayout } from "@/components/admin/resource-layout";
import { DeleteDialog } from "@/components/shared/delete-dialog";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
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
  initialDeleteDialogOpen?: boolean;
};

export function AdministrativeEventModalityDetailView({
  loaderData,
  actionData,
  modalityId,
  initialDeleteDialogOpen = false,
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
      headerAction={
        modality ? (
          <ModalityActions
            modality={modality}
            initialDeleteDialogOpen={initialDeleteDialogOpen}
          />
        ) : null
      }
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

function ModalityActions({
  modality,
  initialDeleteDialogOpen = false,
}: {
  modality: EventModalityRow;
  initialDeleteDialogOpen?: boolean;
}) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(
    initialDeleteDialogOpen,
  );

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
      <DeleteDialog
        title="Eliminar modalidad"
        description={`Esta acción borra ${modality.name} si no tiene submodalidades, categorías o cronogramas relacionados. No se puede deshacer.`}
        intentValue="delete-modality"
        recordId={modality.id}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      />
    </>
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

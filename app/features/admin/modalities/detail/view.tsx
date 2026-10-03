import { TriangleAlert } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { AdminResourceLayout } from "@/components/admin/resource-layout";
import { AlertStack } from "@/components/shared/alert-stack";
import { DeleteDialog } from "@/components/shared/delete-dialog";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { noOfferedSheets } from "@/lib/judging/sheet-criteria";
import { useServerActionToast } from "@/lib/shared/toasts";

import { incompleteSubmodalities } from "../criteria-status";
import {
  getModalitySubmittedValues,
  ModalityForm,
  ModalityFormActions,
  useEventModalityForm,
  ModalityFormPanel,
} from "../form";
import type {
  EventModalitiesLoaderData,
  EventModalityActionData,
  EventModalityRow,
  EventSubmodalityRow,
} from "../shared";

export type EventModalityDetailViewProps = {
  loaderData: EventModalitiesLoaderData;
  actionData?: EventModalityActionData;
  modalityId: string;
  initialDeleteDialogOpen?: boolean;
};

export function EventModalityDetailView({
  loaderData,
  actionData,
  modalityId,
  initialDeleteDialogOpen = false,
}: EventModalityDetailViewProps) {
  useServerActionToast(actionData);

  const modality = loaderData.modalities.find(
    (record) => record.id === modalityId,
  );
  const modalitySubmodalities = useMemo(
    () =>
      loaderData.submodalities.filter(
        (submodality) => submodality.modalityId === modalityId,
      ),
    [loaderData.submodalities, modalityId],
  );
  const submittedValues = useMemo(
    () => getModalitySubmittedValues(actionData, modalityId),
    [actionData, modalityId],
  );
  const sheets = loaderData.modalitySheets[modalityId] ?? noOfferedSheets;
  const form = useEventModalityForm({
    name: modality?.name,
    submodalities: modalitySubmodalities,
    submittedValues,
  });

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title={modality ? modality.name : "Modalidad no encontrada"}
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
        <>
          <IncompleteSheetsAlert
            submodalities={incompleteSubmodalities({
              criteria: loaderData.submodalityCriteria,
              sheets,
              submodalities: modalitySubmodalities,
            })}
          />
          <ModalityFormPanel
            footer={
              <ModalityFormActions
                form={form}
                formId="update-modality-form"
                pendingScope={{
                  intent: "update-modality",
                  fields: { id: modality.id },
                }}
              />
            }
          >
            <ModalityForm
              criteriaSetup={{
                criteria: loaderData.submodalityCriteria,
                lockedSubmodalityIds: loaderData.lockedSubmodalityIds,
                modalityId: modality.id,
                sheets,
                submodalities: modalitySubmodalities,
              }}
              form={form}
              formId="update-modality-form"
              id={modality.id}
              intent="update-modality"
            />
          </ModalityFormPanel>
        </>
      ) : (
        <EmptyResourceState>No encontramos esa modalidad.</EmptyResourceState>
      )}
    </AdminResourceLayout>
  );
}

const submodalityNames = new Intl.ListFormat("es-AR", {
  style: "long",
  type: "conjunction",
});

/**
 * The submodalities a judge cannot score yet, told on the page that fixes
 * them: above the form card, since it is about the modality and not a field.
 */
function IncompleteSheetsAlert({
  submodalities,
}: {
  submodalities: EventSubmodalityRow[];
}) {
  return (
    <AlertStack>
      {submodalities.length > 0 ? (
        <Alert variant="warning">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Planillas incompletas</AlertTitle>
          <AlertDescription>
            {`Los criterios de ${submodalityNames.format(
              submodalities.map((submodality) => submodality.name),
            )} no suman 100 en todas sus planillas, y el jurado no puede puntuar las que quedan incompletas. Completalas desde los criterios de cada submodalidad.`}
          </AlertDescription>
        </Alert>
      ) : null}
    </AlertStack>
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
      <ResourceActionsMenu contentClassName="w-48">
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
        title="¿Eliminar la modalidad?"
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

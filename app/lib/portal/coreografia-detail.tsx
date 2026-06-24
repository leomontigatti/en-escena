import { useState } from "react";

import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { DeleteChoreographyDialog } from "@/lib/portal/coreografia-detail/delete-choreography-dialog";
import { OperationalStatusSummary } from "@/lib/portal/coreografia-detail/operational-status-summary";
import {
  CoreografiaPeopleEditorForm,
  type CoreografiaPeopleEditorActionData,
  type CoreografiaPeopleEditorLoaderData,
} from "@/lib/portal/coreografia-people-editor";
import type { PortalEventContext } from "@/lib/portal/event-context";
import type { ResolveChoreographyDancersResult } from "@/lib/portal/choreography-people.server";

type PortalCoreografiaDetalleLoaderData = CoreografiaPeopleEditorLoaderData & {
  choreography: CoreografiaPeopleEditorLoaderData["choreography"] &
    Record<string, unknown>;
  deletionAvailability: {
    canDelete: boolean;
    warningMessage: string | null;
  };
  eventContext: PortalEventContext;
} & Record<string, unknown>;

export type PortalCoreografiaDetalleRouteViewProps = {
  loaderData: PortalCoreografiaDetalleLoaderData;
  actionData?: CoreografiaPeopleEditorActionData;
  initialDancerResolution?: ResolveChoreographyDancersResult;
  initialDeleteDialogOpen?: boolean;
};

export function PortalCoreografiaDetalleRouteView({
  loaderData,
  actionData,
  initialDeleteDialogOpen = false,
}: PortalCoreografiaDetalleRouteViewProps) {
  const canDeleteChoreography = loaderData.deletionAvailability.canDelete;
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(
    initialDeleteDialogOpen,
  );

  return (
    <section
      className="flex flex-col gap-6"
      aria-labelledby="coreografia-title"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 id="coreografia-title" className="text-xl font-semibold">
            Editar coreografía
          </h1>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            Actualizá bailarines y profesores de esta coreografía.
          </p>
        </div>
        {canDeleteChoreography ? (
          <ResourceActionsMenu contentClassName="w-48">
            <DropdownMenuGroup>
              <DropdownMenuItem
                variant="destructive"
                onSelect={(event) => {
                  event.preventDefault();
                  setIsDeleteDialogOpen(true);
                }}
              >
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </ResourceActionsMenu>
        ) : null}
      </div>

      <OperationalStatusSummary
        operationalStatus={loaderData.choreography.operationalStatus}
      />

      <CoreografiaPeopleEditorForm
        actionData={actionData}
        loaderData={loaderData}
      />

      {canDeleteChoreography ? (
        <DeleteChoreographyDialog
          choreographyId={loaderData.choreography.id}
          isOpen={isDeleteDialogOpen}
          onOpenChange={setIsDeleteDialogOpen}
          warningMessage={loaderData.deletionAvailability.warningMessage}
        />
      ) : null}
    </section>
  );
}

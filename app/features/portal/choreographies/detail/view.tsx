import { useState } from "react";

import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { DeleteChoreographyDialog } from "@/features/portal/choreographies/detail/delete-dialog";
import { OperationalStatusSummary } from "@/features/portal/choreographies/detail/operational-status-summary";
import {
  ChoreographyRosterEditorForm,
  type ChoreographyRosterEditorActionData,
  type ChoreographyRosterEditorLoaderData,
} from "@/features/portal/choreographies/detail/roster-editor";
import type { PortalEventContext } from "@/lib/portal/event-context";
import type { ResolveChoreographyDancersResult } from "@/lib/portal/choreography-roster.server";

type PortalChoreographyDetailLoaderData = ChoreographyRosterEditorLoaderData & {
  choreography: ChoreographyRosterEditorLoaderData["choreography"] &
    Record<string, unknown>;
  deletionAvailability: {
    canDelete: boolean;
    warningMessage: string | null;
  };
  eventContext: PortalEventContext;
} & Record<string, unknown>;

export type PortalChoreographyDetailRouteViewProps = {
  loaderData: PortalChoreographyDetailLoaderData;
  actionData?: ChoreographyRosterEditorActionData;
  initialDancerResolution?: ResolveChoreographyDancersResult;
  initialDeleteDialogOpen?: boolean;
};

export function PortalChoreographyDetailRouteView({
  loaderData,
  actionData,
  initialDeleteDialogOpen = false,
}: PortalChoreographyDetailRouteViewProps) {
  const canDeleteChoreography = loaderData.deletionAvailability.canDelete;
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(
    initialDeleteDialogOpen,
  );

  return (
    <section
      className="flex flex-col gap-6"
      aria-labelledby="choreography-title"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 id="choreography-title" className="text-xl font-semibold">
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

      <ChoreographyRosterEditorForm
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

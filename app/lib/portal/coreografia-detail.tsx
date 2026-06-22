import { Trash2, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
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
import {
  formatOperationalPendingItemLabel,
  type ChoreographyOperationalStatus,
} from "@/lib/portal/choreographies";
import {
  CoreografiaPeopleEditorForm,
  type CoreografiaPeopleEditorActionData,
  type CoreografiaPeopleEditorLoaderData,
} from "@/lib/portal/coreografia-people-editor";
import type { PortalEventContext } from "@/lib/portal/event-context";
import type { ResolveChoreographyDancersResult } from "@/lib/portal/choreographies.server";
import { deleteChoreographyIntent } from "@/lib/portal/coreografia-detail.shared";

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

function OperationalStatusSummary({
  operationalStatus,
}: {
  operationalStatus: ChoreographyOperationalStatus;
}) {
  const academyPendingItems = operationalStatus.pendingItems.filter(
    (pendingItem) => pendingItem !== "category",
  );

  if (academyPendingItems.length === 0) {
    return null;
  }

  return (
    <Alert>
      <TriangleAlert aria-hidden="true" />
      <AlertDescription>
        {academyPendingItems.length === 1 ? "Falta" : "Faltan"} cargar{" "}
        {formatAcademyPendingItems(academyPendingItems)}.
      </AlertDescription>
    </Alert>
  );
}

function formatAcademyPendingItems(
  pendingItems: ChoreographyOperationalStatus["pendingItems"],
) {
  return formatList(
    pendingItems.map((pendingItem) => {
      if (pendingItem === "music") {
        return "archivo de música";
      }

      return formatOperationalPendingItemLabel(pendingItem).toLowerCase();
    }),
  );
}

function formatList(items: string[]) {
  if (items.length <= 1) {
    return items[0] ?? "";
  }

  return `${items.slice(0, -1).join(", ")} y ${items.at(-1)}`;
}

function DeleteChoreographyDialog({
  choreographyId,
  isOpen,
  onOpenChange,
  warningMessage,
}: {
  choreographyId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  warningMessage: string | null;
}) {
  return (
    <>
      {isOpen ? (
        <div className="sr-only">
          <p>¿Eliminar Coreografía?</p>
          <p>
            En esta versión la eliminación es definitiva y libera el cupo del
            Cupo de cronograma.
          </p>
          {warningMessage ? <p>{warningMessage}</p> : null}
          <input type="hidden" name="intent" value={deleteChoreographyIntent} />
        </div>
      ) : null}
      <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
        {isOpen ? (
          <AlertDialogContent
            forceMount
            className="w-[calc(100%-2rem)] max-w-lg gap-4 p-6 sm:max-w-lg"
          >
            <AlertDialogHeader className="flex flex-col items-start gap-1.5 text-left">
              <AlertDialogTitle>¿Eliminar Coreografía?</AlertDialogTitle>
              <AlertDialogDescription>
                En esta versión la eliminación es definitiva y libera el cupo
                del Cupo de cronograma.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {warningMessage ? (
              <p className="rounded-lg bg-muted px-4 py-3 text-sm leading-6 text-muted-foreground">
                {warningMessage}
              </p>
            ) : null}
            <AlertDialogFooter className="m-0 rounded-none border-0 bg-transparent p-0">
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <form method="post">
                <input
                  type="hidden"
                  name="intent"
                  value={deleteChoreographyIntent}
                />
                <input
                  type="hidden"
                  name="confirmDeletion"
                  value={choreographyId}
                />
                <Button type="submit" variant="destructive">
                  <Trash2 aria-hidden="true" data-icon="inline-start" />
                  Eliminar Coreografía
                </Button>
              </form>
            </AlertDialogFooter>
          </AlertDialogContent>
        ) : null}
      </AlertDialog>
    </>
  );
}

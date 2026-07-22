import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useFetcher } from "react-router";

import { PortalEmptyState, PortalListPage } from "@/components/portal/ui";
import {
  ClientDataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CreateChoreographyDialog } from "@/features/portal/choreographies/create/dialog";
import type { CreateChoreographyDialogLoaderData } from "@/features/portal/choreographies/create/server";
import type { loadPortalChoreographiesList } from "@/features/portal/choreographies/list/server";
import {
  getChoreographyOperationalStatusBadgeVariant,
  type ChoreographyOperationalStatus,
} from "@/lib/choreographies/operational-status";
import { getPortalChoreographyCreationAvailability } from "@/lib/portal/choreography-creation-availability";
import {
  formatGroupTypeLabel as formatChoreographyGroupTypeLabel,
  formatOperationalStatusLabel,
  type ChoreographyListItem,
} from "@/lib/portal/choreographies";
import { notificationToasts } from "@/lib/shared/notification-toasts";
import { showToastMessage } from "@/lib/shared/toasts";

type PortalChoreographiesListRouteProps = {
  loaderData: Awaited<ReturnType<typeof loadPortalChoreographiesList>>;
  created?: boolean;
  initialCreateDialogOpen?: boolean;
};

type PortalChoreographiesEventContext =
  PortalChoreographiesListRouteProps["loaderData"]["eventContext"];

export function PortalChoreographiesListRouteView({
  loaderData,
  created = false,
  initialCreateDialogOpen = false,
}: PortalChoreographiesListRouteProps) {
  const selectedEvent = loaderData.eventContext.selectedEvent;
  const creationAvailability = getPortalChoreographyCreationAvailability({
    activeDancerCount: loaderData.activeDancerCount,
    eventContext: loaderData.eventContext,
  });
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(
    initialCreateDialogOpen,
  );

  useEffect(() => {
    if (created) {
      showToastMessage(notificationToasts["coreografia-creada"]);
    }
  }, [created]);

  return (
    <>
      <PortalListPage
        titleId="coreografias-title"
        title="Coreografías"
        description="Gestioná las coreografías de tu academia que van a participar del evento y seguí su estado operativo."
        action={
          selectedEvent ? (
            <Button
              type="button"
              disabled={!creationAvailability.canCreate}
              onClick={() => setIsCreateModalOpen(true)}
            >
              <Plus aria-hidden="true" data-icon />
              Nueva coreografía
            </Button>
          ) : null
        }
      >
        {selectedEvent && loaderData.choreographies.length > 0 ? (
          <ChoreographyTable choreographies={loaderData.choreographies} />
        ) : (
          <PortalEmptyState
            title={getChoreographiesEmptyTitle(loaderData.eventContext)}
            description={getChoreographiesEmptyDescription(
              loaderData.eventContext,
            )}
          />
        )}
      </PortalListPage>

      {isCreateModalOpen && selectedEvent ? (
        <CreateChoreographyDialogLoader
          eventId={selectedEvent.id}
          onClose={() => setIsCreateModalOpen(false)}
        />
      ) : null}
    </>
  );
}

function ChoreographyTable({
  choreographies,
}: {
  choreographies: PortalChoreographiesListRouteProps["loaderData"]["choreographies"];
}) {
  const columns: DataTableColumn<ChoreographyListItem>[] = [
    {
      id: "name",
      header: "Nombre",
      className: "font-medium",
      cell: (choreography) => (
        <DataTableLink to={`/portal/coreografias/${choreography.id}`}>
          {choreography.name}
        </DataTableLink>
      ),
      filterValue: (choreography) =>
        [
          choreography.name,
          choreography.modalityName,
          choreography.submodalityName,
          choreography.categoryName,
          formatChoreographyGroupTypeLabel(choreography.groupType),
        ]
          .filter(Boolean)
          .join(" "),
      sortValue: (choreography) => choreography.name,
    },
    {
      id: "modality",
      header: "Modalidad / Submodalidad",
      cell: (choreography) => (
        <span className="text-muted-foreground">
          {formatPrimaryAndSecondaryValue(
            choreography.modalityName,
            choreography.submodalityName,
          )}
        </span>
      ),
      filterValue: (choreography) =>
        [choreography.modalityName, choreography.submodalityName]
          .filter(Boolean)
          .join(" "),
    },
    {
      id: "categoryGroup",
      header: "Categoría / Tipo de grupo",
      cell: (choreography) => (
        <span className="text-muted-foreground">
          {formatPrimaryAndSecondaryValue(
            choreography.categoryName ?? "Sin asignar",
            formatChoreographyGroupTypeLabel(choreography.groupType),
          )}
        </span>
      ),
      filterValue: (choreography) =>
        [
          choreography.categoryName ?? "Sin asignar",
          formatChoreographyGroupTypeLabel(choreography.groupType),
        ].join(" "),
    },
    {
      id: "status",
      header: "Estado",
      cell: (choreography) => (
        <OperationalStatusBadge
          operationalStatus={choreography.operationalStatus}
        />
      ),
      filterValues: (choreography) => [
        choreography.operationalStatus.code,
        choreography.modalityName,
        choreography.categoryName ?? "pending-category",
        choreography.groupType,
      ],
    },
  ];

  return (
    <ClientDataTable
      rows={choreographies}
      columns={columns}
      getRowKey={(choreography) => choreography.id}
      searchPlaceholder="Buscar coreografía por nombre, modalidad o categoría"
      textFilterColumnId="name"
      facetedFilters={buildChoreographyFacetedFilters(choreographies)}
      emptyMessage="No hay coreografías que coincidan con la búsqueda o los filtros."
      initialSort={{ columnId: "name", direction: "asc" }}
    />
  );
}

function buildChoreographyFacetedFilters(
  choreographies: ChoreographyListItem[],
) {
  return [
    {
      label: "Estado",
      options: [
        { label: "Completa", value: "complete" },
        { label: "Incompleta", value: "incomplete" },
      ],
    },
    {
      label: "Modalidad",
      options: getUniqueSortedOptions(
        choreographies.map((choreography) => ({
          label: choreography.modalityName,
          value: choreography.modalityName,
        })),
      ),
    },
    {
      label: "Categoría",
      options: getUniqueSortedOptions(
        choreographies.map((choreography) => ({
          label: choreography.categoryName ?? "Sin asignar",
          value: choreography.categoryName ?? "pending-category",
        })),
      ),
    },
    {
      label: "Tipo de grupo",
      options: [
        { label: "Solo", value: "solo" },
        { label: "Dúo", value: "duo" },
        { label: "Trío", value: "trio" },
        { label: "Grupal", value: "grupal" },
      ],
    },
  ];
}

function getUniqueSortedOptions(
  options: Array<{ label: string; value: string }>,
) {
  return Array.from(
    new Map(options.map((option) => [option.value, option])).values(),
  ).sort((firstOption, secondOption) =>
    firstOption.label.localeCompare(secondOption.label, "es-AR"),
  );
}

function OperationalStatusBadge({
  operationalStatus,
}: {
  operationalStatus: ChoreographyOperationalStatus;
}) {
  return (
    <Badge
      variant={getChoreographyOperationalStatusBadgeVariant(operationalStatus)}
    >
      {formatOperationalStatusLabel(operationalStatus)}
    </Badge>
  );
}

function getChoreographiesEmptyTitle(
  eventContext: PortalChoreographiesEventContext,
) {
  if (eventContext.selectedEvent) {
    return "No hay coreografías registradas para este evento";
  }

  if (eventContext.hasEvents) {
    return "Todavía no hay un evento activo";
  }

  return "Todavía no hay eventos configurados";
}

function getChoreographiesEmptyDescription(
  eventContext: PortalChoreographiesEventContext,
) {
  if (eventContext.selectedEvent) {
    return "Cuando registres una coreografía para el evento activo, la vas a poder seguir acá junto con su estado operativo.";
  }

  if (eventContext.hasEvents) {
    return "Cuando administración active un evento, vas a poder consultar las coreografías de tu academia desde esta sección.";
  }

  return "Cuando administración cree un evento, vas a poder consultar las coreografías de tu academia desde esta sección.";
}

function formatPrimaryAndSecondaryValue(
  primaryValue: string,
  secondaryValue: string | null,
) {
  return secondaryValue ? `${primaryValue} · ${secondaryValue}` : primaryValue;
}

function CreateChoreographyDialogLoader({
  eventId,
  onClose,
}: {
  eventId: string;
  onClose: () => void;
}) {
  const fetcher = useFetcher<CreateChoreographyDialogLoaderData>();

  useEffect(() => {
    if (fetcher.state !== "idle" || fetcher.data) {
      return;
    }

    fetcher.load("/portal/coreografias/crear");
  }, [fetcher]);

  if (!fetcher.data) {
    return (
      <div
        aria-busy="true"
        aria-live="polite"
        className="sr-only"
        data-testid="create-choreography-dialog-loading"
      >
        Cargando opciones para crear la coreografía.
      </div>
    );
  }

  return (
    <CreateChoreographyDialog
      baseOptions={fetcher.data.registrationBaseOptions}
      dancers={fetcher.data.activeDancers}
      eventId={eventId}
      professors={fetcher.data.activeProfessors}
      onClose={onClose}
    />
  );
}

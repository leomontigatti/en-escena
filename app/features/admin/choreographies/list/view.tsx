import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import {
  DataTableTruncatedText,
  ServerDataTable,
  type DataTableColumn,
  type DataTableFacetedFilter,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { Badge } from "@/components/ui/badge";
import {
  formatChoreographyOperationalStatusLabel,
  getChoreographyOperationalStatusBadgeVariant,
} from "@/lib/choreographies/operational-status";
import { formatEventSequenceNumber } from "@/lib/events/sequence-number";
import { formatGroupTypeLabel } from "@/lib/portal/choreographies";
import { formatPrimaryAndSecondaryValue } from "@/lib/shared/format-primary-and-secondary-value";

import type { loadChoreographies } from "./server";

type LoaderData = Awaited<ReturnType<typeof loadChoreographies>>;
type ChoreographyRow = LoaderData["choreographies"][number];

type ChoreographiesListRouteViewProps = {
  loaderData: LoaderData;
};

const choreographyStatusFilterOptions = [
  { label: "Completa", value: "completa" },
  { label: "Incompleta", value: "incompleta" },
];

const choreographyGroupTypeFilterOptions = [
  { label: "Solo", value: "solo" },
  { label: "Dúo", value: "duo" },
  { label: "Trío", value: "trio" },
  { label: "Grupal", value: "grupal" },
];

const choreographyColumns: DataTableColumn<ChoreographyRow>[] = [
  {
    id: "numero",
    header: "#",
    width: 7,
    className: "font-medium tabular-nums",
    cell: (choreography) => (
      <DataTableLink to={`/administracion/coreografias/${choreography.id}`}>
        {formatEventSequenceNumber(choreography.choreographyNumber)}
      </DataTableLink>
    ),
    filterValue: (choreography) =>
      formatEventSequenceNumber(choreography.choreographyNumber),
    sortValue: (choreography) => choreography.choreographyNumber,
  },
  {
    id: "nombre",
    header: "Nombre",
    width: 23,
    className: "font-medium",
    // The number is the row's only way into the detail. Linking the name too
    // gave one destination two targets, which reads as a choice and is not.
    cell: (choreography) => (
      <DataTableTruncatedText value={choreography.name} />
    ),
    filterValue: (choreography) => choreography.name,
    sortValue: (choreography) => choreography.name,
  },
  {
    id: "academia",
    header: "Academia",
    width: 23,
    className: "text-muted-foreground",
    cell: (choreography) => (
      <DataTableTruncatedText value={choreography.academyName} />
    ),
    filterValue: (choreography) => choreography.academyName,
    sortValue: (choreography) => choreography.academyName,
  },
  {
    id: "modalidadSubmodalidad",
    header: "Modalidad / Submodalidad",
    width: 18,
    className: "text-muted-foreground",
    cell: (choreography) => (
      <DataTableTruncatedText
        value={formatPrimaryAndSecondaryValue(
          choreography.modalityName,
          choreography.submodalityName,
        )}
      />
    ),
  },
  {
    id: "categoriaTipoGrupo",
    header: "Categoría / Tipo de grupo",
    width: 19,
    className: "text-muted-foreground",
    cell: (choreography) => (
      <DataTableTruncatedText
        value={formatPrimaryAndSecondaryValue(
          choreography.categoryName ?? "Sin asignar",
          formatGroupTypeLabel(choreography.groupType),
        )}
      />
    ),
  },
  {
    id: "estado",
    header: "Estado",
    width: 10,
    cell: (choreography) => (
      <Badge
        variant={getChoreographyOperationalStatusBadgeVariant(
          choreography.operationalStatus,
        )}
      >
        {formatChoreographyOperationalStatusLabel(
          choreography.operationalStatus,
        )}
      </Badge>
    ),
  },
];

export function ChoreographiesListRouteView({
  loaderData,
}: ChoreographiesListRouteViewProps) {
  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Coreografías"
      description="Revisá las coreografías registradas para el evento activo y su estado operativo."
      eventRequiredEmptyState={{
        title: "Elegí un evento activo para revisar coreografías",
        description:
          "Activá un evento para consultar las coreografías registradas por las academias.",
      }}
    >
      {hasChoreographyTableContent(loaderData) ? (
        <ChoreographyTable loaderData={loaderData} />
      ) : (
        <AdminEmptyState
          title="Todavía no hay coreografías para mostrar."
          description="Cuando las academias registren coreografías para el evento activo, vas a poder revisarlas desde este listado."
        />
      )}
    </AdminResourceLayout>
  );
}

function ChoreographyTable({ loaderData }: { loaderData: LoaderData }) {
  return (
    <ServerDataTable
      rows={loaderData.choreographies}
      columns={choreographyColumns}
      getRowKey={(choreography) => choreography.id}
      // The widths above share the row out, so it cannot outgrow the page and
      // the list never asks the reader to scroll sideways.
      layout="fit"
      searchPlaceholder="Buscar coreografía por número, nombre o academia"
      initialSearchValue={loaderData.filters.query}
      facetedFilters={buildChoreographyFacetedFilters(loaderData)}
      initialFacetedFilterValues={buildChoreographyInitialFilters(loaderData)}
      initialSort={loaderData.filters.order}
      emptyMessage="No hay coreografías que coincidan con la búsqueda o los filtros."
      currentPage={loaderData.filters.page}
      totalPages={loaderData.totalPages}
      totalRows={loaderData.totalCount}
    />
  );
}

function hasChoreographyTableContent(loaderData: LoaderData) {
  return (
    loaderData.choreographies.length > 0 ||
    loaderData.hasAnyChoreography ||
    hasNarrowedChoreographyList(loaderData.filters)
  );
}

/**
 * Whether the reader asked for this list rather than landed on it. An admin who
 * filtered their way to nothing is told nothing matched, and keeps the table to
 * undo it with; the empty state is for an event that has no choreographies yet.
 */
function hasNarrowedChoreographyList(filters: LoaderData["filters"]) {
  return (
    filters.query.length > 0 ||
    filters.page > 1 ||
    filters.status !== null ||
    filters.modalityId !== null ||
    filters.category !== null ||
    filters.groupType !== null ||
    filters.scheduleDate !== null ||
    hasNonDefaultChoreographyOrder(filters.order)
  );
}

function hasNonDefaultChoreographyOrder(order: LoaderData["filters"]["order"]) {
  return order.direction === "desc" || order.columnId !== "academia";
}

function buildChoreographyFacetedFilters(
  loaderData: LoaderData,
): DataTableFacetedFilter[] {
  return [
    {
      id: "estado",
      label: "Estado",
      options: choreographyStatusFilterOptions,
    },
    {
      id: "modalidad",
      label: "Modalidad",
      options: loaderData.facets.modalities,
    },
    {
      id: "categoria",
      label: "Categoría",
      options: loaderData.facets.categories,
    },
    {
      id: "tipo-grupo",
      label: "Tipo de grupo",
      options: choreographyGroupTypeFilterOptions,
    },
    {
      id: "dia",
      label: "Día",
      options: loaderData.facets.scheduleDates,
    },
  ];
}

function buildChoreographyInitialFilters(loaderData: LoaderData) {
  const filters: Record<string, string> = {};

  if (loaderData.filters.status) {
    filters.estado = loaderData.filters.status;
  }

  if (loaderData.filters.modalityId) {
    filters.modalidad = loaderData.filters.modalityId;
  }

  if (loaderData.filters.category) {
    filters.categoria = loaderData.filters.category;
  }

  if (loaderData.filters.groupType) {
    filters["tipo-grupo"] = loaderData.filters.groupType;
  }

  if (loaderData.filters.scheduleDate) {
    filters.dia = loaderData.filters.scheduleDate;
  }

  return {
    filters,
  };
}

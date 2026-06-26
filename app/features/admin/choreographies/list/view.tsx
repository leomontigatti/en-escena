import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import {
  DataTable,
  type DataTableColumn,
  type DataTableFacetedFilter,
} from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import {
  formatChoreographyOperationalStatusLabel,
  getChoreographyOperationalStatusBadgeVariant,
} from "@/lib/choreographies/operational-status";
import { formatGroupTypeLabel } from "@/lib/portal/choreographies";

import type { loadAdministrativeChoreographies } from "./server";

type LoaderData = Awaited<ReturnType<typeof loadAdministrativeChoreographies>>;
type ChoreographyRow = LoaderData["choreographies"][number];

type AdministracionCoreografiasRouteViewProps = {
  loaderData: LoaderData;
};

const administrativeChoreographyStatusFilterOptions = [
  { label: "Completa", value: "completa" },
  { label: "Incompleta", value: "incompleta" },
];

const administrativeChoreographyGroupTypeFilterOptions = [
  { label: "Solo", value: "solo" },
  { label: "Dúo", value: "duo" },
  { label: "Trío", value: "trio" },
  { label: "Grupal", value: "grupal" },
];

const choreographyColumns: DataTableColumn<ChoreographyRow>[] = [
  {
    id: "nombre",
    header: "Nombre",
    className: "w-[22%] font-medium",
    headerClassName: "w-[22%]",
    cell: (choreography) => choreography.name,
    filterValue: (choreography) => choreography.name,
    sortValue: (choreography) => choreography.name,
  },
  {
    id: "academia",
    header: "Academia",
    className: "w-[22%] text-muted-foreground",
    headerClassName: "w-[22%]",
    cell: (choreography) => choreography.academyName,
    filterValue: (choreography) => choreography.academyName,
    sortValue: (choreography) => choreography.academyName,
  },
  {
    id: "modalidadSubmodalidad",
    header: "Modalidad / Submodalidad",
    className: "w-[22%] text-muted-foreground",
    headerClassName: "w-[22%]",
    cell: (choreography) =>
      formatPrimaryAndSecondaryValue(
        choreography.modalityName,
        choreography.submodalityName,
      ),
  },
  {
    id: "categoriaTipoGrupo",
    header: "Categoría / Tipo de grupo",
    className: "w-[22%] text-muted-foreground",
    headerClassName: "w-[22%]",
    cell: (choreography) =>
      formatPrimaryAndSecondaryValue(
        choreography.categoryName ?? "Sin asignar",
        formatGroupTypeLabel(choreography.groupType),
      ),
  },
  {
    id: "estado",
    header: "Estado",
    className: "w-[12%]",
    headerClassName: "w-[12%]",
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

export function AdministracionCoreografiasRouteView({
  loaderData,
}: AdministracionCoreografiasRouteViewProps) {
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
      {hasAdministrativeChoreographyTableContent(loaderData) ? (
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
    <DataTable
      mode="server"
      rows={loaderData.choreographies}
      columns={choreographyColumns}
      getRowKey={(choreography) => choreography.id}
      searchPlaceholder="Buscar coreografía por nombre o academia"
      initialSearchValue={loaderData.filters.query}
      facetedFilters={buildAdministrativeChoreographyFacetedFilters(loaderData)}
      initialFacetedFilterValues={buildAdministrativeChoreographyInitialFilters(
        loaderData,
      )}
      initialSort={loaderData.filters.order}
      emptyMessage="No hay coreografías que coincidan con la búsqueda o los filtros."
      currentPage={loaderData.filters.page}
      pageParamName="pagina"
      searchParamName="busqueda"
      sortParamName="orden"
      totalPages={loaderData.totalPages}
      totalRows={loaderData.totalCount}
    />
  );
}

function hasAdministrativeChoreographyTableContent(loaderData: LoaderData) {
  return (
    loaderData.choreographies.length > 0 ||
    loaderData.hasAnyChoreography ||
    loaderData.filters.query.length > 0 ||
    loaderData.filters.page > 1 ||
    loaderData.filters.status !== null ||
    loaderData.filters.modalityId !== null ||
    loaderData.filters.category !== null ||
    loaderData.filters.groupType !== null ||
    hasNonDefaultAdministrativeChoreographyOrder(loaderData.filters.order)
  );
}

function hasNonDefaultAdministrativeChoreographyOrder(
  order: LoaderData["filters"]["order"],
) {
  return order.direction === "desc" || order.columnId !== "academia";
}

function formatPrimaryAndSecondaryValue(
  primaryValue: string,
  secondaryValue: string | null,
) {
  return secondaryValue ? `${primaryValue} · ${secondaryValue}` : primaryValue;
}

function buildAdministrativeChoreographyFacetedFilters(
  loaderData: LoaderData,
): DataTableFacetedFilter[] {
  return [
    {
      columnId: "filters",
      label: "Filtros",
      groups: [
        {
          id: "estado",
          label: "Estado",
          options: administrativeChoreographyStatusFilterOptions,
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
          options: administrativeChoreographyGroupTypeFilterOptions,
        },
      ],
    },
  ];
}

function buildAdministrativeChoreographyInitialFilters(loaderData: LoaderData) {
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

  return {
    filters,
  };
}

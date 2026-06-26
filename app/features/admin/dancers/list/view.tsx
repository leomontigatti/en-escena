import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import {
  DataTable,
  type DataTableColumn,
  type DataTableFacetedFilter,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { Badge } from "@/components/ui/badge";
import {
  getAdminDancerIdentificationBadgeVariant,
  getAdminDancerParticipationBadgeVariant,
  getAdminDancerParticipationLabel,
  toAdminDancerIdentificationSearchValue,
  toAdminDancerParticipationSearchValue,
  toAdminDancerStatusSearchValue,
  type AdminDancerIdentificationStatus,
  type AdminDancerParticipationStatus,
} from "@/lib/admin/dancers/dancers.shared";

import type { loadAdministrativeDancersList } from "./server";

type LoaderData = Awaited<ReturnType<typeof loadAdministrativeDancersList>>;
type DancerRow = LoaderData["dancers"][number];
type FacetedFilterGroup = DataTableFacetedFilter["groups"][number];

export type AdministracionBailarinesRouteViewProps = {
  loaderData: LoaderData;
};

export function AdministracionBailarinesRouteView({
  loaderData,
}: AdministracionBailarinesRouteViewProps) {
  const shouldShowTable =
    loaderData.dancers.length > 0 ||
    hasActiveListFilters(loaderData) ||
    loaderData.hasAnyDancer;

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Bailarines"
      description="Consultá la ficha administrativa de cada bailarín y revisá su estado operativo desde el listado."
      requireSelectedEvent={false}
    >
      {shouldShowTable ? (
        <DancerTable loaderData={loaderData} />
      ) : (
        <AdminEmptyState
          title="No hay Bailarines que coincidan con la búsqueda."
          description={
            loaderData.selectedEventId
              ? "Ajustá los filtros para revisar otros registros del Evento activo."
              : "Cuando haya bailarines activos vas a poder revisarlos desde este listado."
          }
        />
      )}
    </AdminResourceLayout>
  );
}

function DancerTable({ loaderData }: { loaderData: LoaderData }) {
  const columns: DataTableColumn<DancerRow>[] = [
    {
      id: "nombre",
      header: "Nombre",
      className: "w-1/2 font-medium",
      headerClassName: "w-1/2",
      cell: (dancer) => (
        <DataTableLink to={buildDancerDetailHref(loaderData, dancer.id)}>
          {dancer.firstName} {dancer.lastName}
        </DataTableLink>
      ),
      filterValue: (dancer) => `${dancer.firstName} ${dancer.lastName}`,
      sortValue: (dancer) => `${dancer.firstName} ${dancer.lastName}`,
    },
    {
      id: "academy",
      header: "Academia",
      className: "w-1/4 text-muted-foreground",
      headerClassName: "w-1/4",
      cell: (dancer) => dancer.academyName,
      filterValue: (dancer) => dancer.academyName,
    },
    {
      id: "status",
      header: "Estado",
      className: "w-1/4",
      headerClassName: "w-1/4",
      cell: (dancer) => (
        <div className="flex flex-wrap gap-2">
          {loaderData.selectedEventId ? (
            <ParticipationBadge
              participationStatus={dancer.participationStatus}
            />
          ) : null}
          {!dancer.active ? (
            <Badge variant="destructive">Archivado</Badge>
          ) : null}
          <IdentificationBadge
            identificationStatus={dancer.identificationStatus}
          />
        </div>
      ),
      filterValue: (dancer) =>
        buildDancerStatusSummary(dancer, loaderData.selectedEventId),
    },
  ];

  return (
    <DataTable
      mode="server"
      rows={loaderData.dancers}
      columns={columns}
      getRowKey={(dancer) => dancer.id}
      searchPlaceholder="Buscar bailarín por nombre, número de documento o academia"
      initialSearchValue={loaderData.filters.query}
      facetedFilters={buildDancerFacetedFilters(loaderData)}
      initialFacetedFilterValues={buildInitialFacetedFilterValues(loaderData)}
      initialSort={{
        columnId: "nombre",
        direction: loaderData.filters.nameOrder,
      }}
      emptyMessage="No hay Bailarines que coincidan con la búsqueda o los filtros."
      currentPage={loaderData.filters.page}
      pageParamName="pagina"
      searchParamName="busqueda"
      totalPages={loaderData.totalPages}
      totalRows={loaderData.totalCount}
    />
  );
}

function ParticipationBadge({
  participationStatus,
}: {
  participationStatus: AdminDancerParticipationStatus;
}) {
  return (
    <Badge
      variant={getAdminDancerParticipationBadgeVariant(participationStatus)}
    >
      {getAdminDancerParticipationLabel(participationStatus)}
    </Badge>
  );
}

function IdentificationBadge({
  identificationStatus,
}: {
  identificationStatus: AdminDancerIdentificationStatus;
}) {
  return (
    <Badge
      variant={getAdminDancerIdentificationBadgeVariant(identificationStatus)}
    >
      {getGroupedDancerIdentificationLabel(identificationStatus)}
    </Badge>
  );
}

function getGroupedDancerIdentificationLabel(
  identificationStatus: AdminDancerIdentificationStatus,
) {
  switch (identificationStatus) {
    case "unverified":
      return "Sin verificar";
    case "verified":
      return "Verificado";
    default:
      return "Incompleto";
  }
}

function buildDancerFacetedFilters(
  loaderData: LoaderData,
): DataTableFacetedFilter[] {
  const groups: FacetedFilterGroup[] = [];

  if (loaderData.selectedEventId !== null) {
    groups.push({
      id: "participando",
      label: "Participación",
      options: [
        { label: "Participando", value: "si" },
        { label: "No participando", value: "no" },
      ],
    });
  }

  groups.push(
    {
      id: "identificacion",
      label: "Verificación",
      options: [
        { label: "Incompleto", value: "incompleta" },
        { label: "Sin verificar", value: "sin-verificar" },
        { label: "Verificado", value: "verificados" },
      ],
    },
    {
      id: "estado",
      label: "Archivo",
      options: [{ label: "Archivado", value: "archivados" }],
    },
  );

  return [
    {
      columnId: "filters",
      label: "Filtros",
      groups,
    },
  ];
}

function buildDancerStatusSummary(
  dancer: DancerRow,
  selectedEventId: string | null,
) {
  const values: string[] = [];

  if (selectedEventId !== null) {
    values.push(getAdminDancerParticipationLabel(dancer.participationStatus));
  }

  if (!dancer.active) {
    values.push("Archivado");
  }

  values.push(getGroupedDancerIdentificationLabel(dancer.identificationStatus));

  return values.join(" ");
}

function buildDancerDetailHref(loaderData: LoaderData, dancerId: string) {
  return `/administracion/bailarines/${dancerId}${buildDetailSearch(loaderData)}`;
}

function buildDetailSearch(loaderData: LoaderData) {
  const searchParams = buildSearchParams(loaderData);
  const search = searchParams.toString();

  return search.length > 0 ? `?${search}` : "";
}

function buildSearchParams(loaderData: LoaderData) {
  const searchParams = new URLSearchParams();

  if (loaderData.filters.query.length > 0) {
    searchParams.set("busqueda", loaderData.filters.query);
  }

  if (loaderData.filters.nameOrder === "desc") {
    searchParams.set("orden", "nombre:desc");
  }

  const values = getSelectedFilterValues(loaderData);

  if (values.participando) {
    searchParams.set("participando", values.participando);
  }

  if (values.estado) {
    searchParams.set("estado", values.estado);
  }

  if (values.identificacion) {
    searchParams.set("identificacion", values.identificacion);
  }

  if (loaderData.filters.page > 1) {
    searchParams.set("pagina", String(loaderData.filters.page));
  }

  return searchParams;
}

function buildInitialFacetedFilterValues(loaderData: LoaderData) {
  const values = getSelectedFilterValues(loaderData);

  return Object.keys(values).length > 0 ? { filters: values } : undefined;
}

function getSelectedFilterValues(loaderData: LoaderData) {
  const values: Record<string, string> = {};
  const participationValue = toAdminDancerParticipationSearchValue(
    loaderData.filters.participation,
  );
  const statusValue = toAdminDancerStatusSearchValue(loaderData.filters.status);
  const identificationValue = toAdminDancerIdentificationSearchValue(
    loaderData.filters.identification,
  );

  if (loaderData.selectedEventId !== null && participationValue !== "todos") {
    values.participando = participationValue;
  }

  if (statusValue === "archivados") {
    values.estado = statusValue;
  }

  if (identificationValue !== "todos") {
    values.identificacion = identificationValue;
  }

  return values;
}

function hasActiveListFilters(loaderData: LoaderData) {
  const participationValue = toAdminDancerParticipationSearchValue(
    loaderData.filters.participation,
  );
  const statusValue = toAdminDancerStatusSearchValue(loaderData.filters.status);
  const identificationValue = toAdminDancerIdentificationSearchValue(
    loaderData.filters.identification,
  );

  return (
    loaderData.filters.query.length > 0 ||
    loaderData.filters.page > 1 ||
    (loaderData.selectedEventId !== null && participationValue !== "todos") ||
    statusValue === "archivados" ||
    identificationValue !== "todos"
  );
}

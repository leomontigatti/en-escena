import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import {
  ServerDataTable,
  type DataTableColumn,
  type DataTableFacetedFilter,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { Badge } from "@/components/ui/badge";
import {
  getDancerIdentificationBadgeVariant,
  toDancerIdentificationSearchValue,
  toDancerParticipationSearchValue,
  type DancerIdentificationStatus,
} from "@/lib/admin/dancers/dancers.shared";
import {
  getParticipationBadgeVariant,
  getParticipationLabel,
  type ShownParticipationStatus,
} from "@/lib/participation/participation.shared";
import {
  getRosterPersonStatusLabel,
  toRosterPersonStatus,
  toRosterPersonStatusSearchValue,
} from "@/lib/roster/roster-person-status.shared";
import { RosterPersonStatusBadge } from "@/components/shared/roster-person-status-badge";
import { useRecordTitleLinkTransitionStyle } from "@/lib/shared/view-transitions";

import type { loadDancersList } from "./server";

type LoaderData = Awaited<ReturnType<typeof loadDancersList>>;
type DancerRow = LoaderData["dancers"][number];
type FacetedFilterGroup = DataTableFacetedFilter;

export type DancersListRouteViewProps = {
  loaderData: LoaderData;
};

export function DancersListRouteView({
  loaderData,
}: DancersListRouteViewProps) {
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
        <DancerDetailLink
          href={buildDancerDetailHref(loaderData, dancer.id)}
          name={`${dancer.firstName} ${dancer.lastName}`}
        />
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
          {dancer.participationStatus !== "no-event" ? (
            <ParticipationBadge
              participationStatus={dancer.participationStatus}
            />
          ) : null}
          <RosterPersonStatusBadge
            status={toRosterPersonStatus(dancer.active)}
          />
          <IdentificationBadge
            identificationStatus={dancer.identificationStatus}
          />
        </div>
      ),
      filterValue: (dancer) => buildDancerStatusSummary(dancer),
    },
  ];

  return (
    <ServerDataTable
      rows={loaderData.dancers}
      columns={columns}
      getRowKey={(dancer) => dancer.id}
      pageParamName="pagina"
      searchParamName="busqueda"
      sortParamName="orden"
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
      totalPages={loaderData.totalPages}
      totalRows={loaderData.totalCount}
    />
  );
}

function ParticipationBadge({
  participationStatus,
}: {
  participationStatus: ShownParticipationStatus;
}) {
  return (
    <Badge variant={getParticipationBadgeVariant(participationStatus)}>
      {getParticipationLabel(participationStatus)}
    </Badge>
  );
}

function IdentificationBadge({
  identificationStatus,
}: {
  identificationStatus: DancerIdentificationStatus;
}) {
  return (
    <Badge variant={getDancerIdentificationBadgeVariant(identificationStatus)}>
      {getGroupedDancerIdentificationLabel(identificationStatus)}
    </Badge>
  );
}

function getGroupedDancerIdentificationLabel(
  identificationStatus: DancerIdentificationStatus,
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
      label: "Estado de alta",
      options: [
        { label: "Archivado", value: "archivados" },
        { label: "Todos", value: "todos" },
      ],
    },
  );

  return [...groups];
}

function buildDancerStatusSummary(dancer: DancerRow) {
  const values: string[] = [];

  if (dancer.participationStatus !== "no-event") {
    values.push(getParticipationLabel(dancer.participationStatus));
  }

  if (!dancer.active) {
    values.push(getRosterPersonStatusLabel("archived"));
  }

  values.push(getGroupedDancerIdentificationLabel(dancer.identificationStatus));

  return values.join(" ");
}

function DancerDetailLink({ href, name }: { href: string; name: string }) {
  const viewTransitionStyle = useRecordTitleLinkTransitionStyle(href);

  return (
    <DataTableLink to={href} viewTransition style={viewTransitionStyle}>
      {name}
    </DataTableLink>
  );
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
  const participationValue = toDancerParticipationSearchValue(
    loaderData.filters.participation,
  );
  const statusValue = toRosterPersonStatusSearchValue(
    loaderData.filters.status,
  );
  const identificationValue = toDancerIdentificationSearchValue(
    loaderData.filters.identification,
  );

  if (loaderData.selectedEventId !== null && participationValue !== null) {
    values.participando = participationValue;
  }

  if (statusValue !== null) {
    values.estado = statusValue;
  }

  if (identificationValue !== "todos") {
    values.identificacion = identificationValue;
  }

  return values;
}

function hasActiveListFilters(loaderData: LoaderData) {
  const participationValue = toDancerParticipationSearchValue(
    loaderData.filters.participation,
  );
  const statusValue = toRosterPersonStatusSearchValue(
    loaderData.filters.status,
  );
  const identificationValue = toDancerIdentificationSearchValue(
    loaderData.filters.identification,
  );

  return (
    loaderData.filters.query.length > 0 ||
    loaderData.filters.page > 1 ||
    (loaderData.selectedEventId !== null && participationValue !== null) ||
    statusValue !== null ||
    identificationValue !== "todos"
  );
}

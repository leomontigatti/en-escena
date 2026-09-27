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
  buildDancerListSearch,
  getDancerIdentificationBadgeVariant,
  toDancerListFacets,
  type DancerIdentificationStatus,
} from "@/lib/admin/dancers/dancers.shared";
import {
  activeListFacets,
  describeEmptyList,
} from "@/lib/list-query/list-query";
import {
  getParticipationBadgeVariant,
  getParticipationLabel,
  type ShownParticipationStatus,
} from "@/lib/participation/participation.shared";
import {
  getRosterPersonStatusLabel,
  toRosterPersonStatus,
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

const emptyDancerList = describeEmptyList("bailarines");

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
          title={emptyDancerList.nothingYet}
          description="Cuando las academias registren bailarines vas a poder revisarlos desde este listado."
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
      searchPlaceholder="Buscar bailarín por nombre, número de documento o academia"
      initialSearchValue={loaderData.filters.query}
      facetedFilters={buildDancerFacetedFilters(loaderData)}
      initialFacetedFilterValues={buildInitialFacetedFilterValues(loaderData)}
      initialSort={loaderData.filters.order}
      emptyMessage={emptyDancerList.nothingMatched}
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
  const search = buildDancerListSearch(
    loaderData.filters,
    loaderData.selectedEventId,
  );

  return search.length > 0 ? `?${search}` : "";
}

function buildInitialFacetedFilterValues(loaderData: LoaderData) {
  const values = getSelectedFilterValues(loaderData);

  return Object.keys(values).length > 0 ? { filters: values } : undefined;
}

function getSelectedFilterValues(loaderData: LoaderData) {
  return activeListFacets(
    toDancerListFacets(loaderData.filters, loaderData.selectedEventId),
  );
}

/**
 * Whether the reader narrowed this list rather than landed on it. The order
 * and the page narrow nothing: a sort reorders the same rows, and a page past
 * the last one is clamped.
 */
function hasActiveListFilters(loaderData: LoaderData) {
  return (
    loaderData.filters.query.length > 0 ||
    Object.keys(getSelectedFilterValues(loaderData)).length > 0
  );
}

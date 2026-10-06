import { useEffect, useState } from "react";

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
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { Badge } from "@/components/ui/badge";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
  buildProfessorListSearch,
  toProfessorListFacets,
} from "@/lib/admin/professors/professors.shared";
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
import { PeriodExportMenu } from "@/features/admin/period-export/menu";
import { buildProfessorAccreditationsHref } from "@/features/admin/professors/accreditations/shared";
import { professorsExportPath } from "@/features/admin/professors/export/shared";

import type { loadProfessorsList } from "./server";

type LoaderData = Awaited<ReturnType<typeof loadProfessorsList>>;
type ProfessorRow = LoaderData["professors"][number];
type FacetedFilterGroup = DataTableFacetedFilter;

export type ProfessorsListRouteViewProps = {
  loaderData: LoaderData;
};

const emptyProfessorList = describeEmptyList(
  "profesores",
  "search-and-filters",
);

export function ProfessorsListRouteView({
  loaderData,
}: ProfessorsListRouteViewProps) {
  const shouldShowTable =
    loaderData.professors.length > 0 ||
    hasActiveListFilters(loaderData) ||
    loaderData.hasAnyProfessor;
  // Lifted out of the table because it drives the print action in the header:
  // the ticked rows are what it prints. The list is server-paginated, so any
  // navigation sends other rows, and ticks carried over would print professors
  // nobody can see; clearing falls back to printing what the list matches.
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const visibleRowIds = loaderData.professors.map((row) => row.id).join(",");

  useEffect(() => {
    setSelectedRowIds([]);
  }, [visibleRowIds]);

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Profesores"
      description="Consultá la ficha administrativa de cada profesor y revisá su estado operativo desde el listado."
      requireSelectedEvent={false}
      headerAction={
        <ProfessorsHeaderAction
          loaderData={loaderData}
          selectedRowIds={selectedRowIds}
        />
      }
    >
      {shouldShowTable ? (
        <ProfessorTable
          loaderData={loaderData}
          selectedRowIds={selectedRowIds}
          onSelectedRowIdsChange={setSelectedRowIds}
        />
      ) : (
        <AdminEmptyState
          title={emptyProfessorList.nothingYet}
          description="Cuando las academias registren profesores vas a poder revisarlos desde este listado."
        />
      )}
    </AdminResourceLayout>
  );
}

/**
 * The administrator prints accreditations, once there is anyone to print; the
 * auditor exports, while an event is active. Nobody else gets a menu.
 */
function ProfessorsHeaderAction({
  loaderData,
  selectedRowIds,
}: {
  loaderData: LoaderData;
  selectedRowIds: string[];
}) {
  if (loaderData.canWrite) {
    if (!loaderData.hasAnyProfessor) {
      return null;
    }

    const printHref = buildProfessorAccreditationsHref({
      professorIds: selectedRowIds,
      listSearch: buildProfessorListSearch(
        loaderData.filters,
        loaderData.selectedEventId,
      ),
    });

    return (
      <ResourceActionsMenu>
        <DropdownMenuItem asChild>
          <a href={printHref} target="_blank" rel="noreferrer">
            Imprimir acreditaciones
          </a>
        </DropdownMenuItem>
      </ResourceActionsMenu>
    );
  }

  if (loaderData.selectedEventId === null) {
    return null;
  }

  return (
    <PeriodExportMenu
      description="Los profesores de las coreografías con inscripciones registradas en el período, en el evento activo. Dejá una fecha vacía para no acotar ese extremo."
      path={professorsExportPath}
      title="Exportar profesores"
    />
  );
}

function ProfessorTable({
  loaderData,
  selectedRowIds,
  onSelectedRowIdsChange,
}: {
  loaderData: LoaderData;
  selectedRowIds: string[];
  onSelectedRowIdsChange: (selectedRowIds: string[]) => void;
}) {
  const columns: DataTableColumn<ProfessorRow>[] = [
    {
      id: "nombre",
      header: "Nombre",
      className: "w-1/2 font-medium",
      headerClassName: "w-1/2",
      cell: (professor) => (
        <DataTableLink to={buildProfessorDetailHref(loaderData, professor.id)}>
          {professor.firstName} {professor.lastName}
        </DataTableLink>
      ),
      filterValue: (professor) =>
        `${professor.firstName} ${professor.lastName}`,
      sortValue: (professor) => `${professor.firstName} ${professor.lastName}`,
    },
    {
      id: "academy",
      header: "Academia",
      className: "w-1/4 text-muted-foreground",
      headerClassName: "w-1/4",
      cell: (professor) => professor.academyName,
      filterValue: (professor) => professor.academyName,
    },
    {
      id: "status",
      header: "Estado",
      className: "w-1/4",
      headerClassName: "w-1/4",
      cell: (professor) => (
        <div className="flex flex-wrap gap-2">
          {professor.participationStatus !== "no-event" ? (
            <ParticipationBadge
              participationStatus={professor.participationStatus}
            />
          ) : null}
          <RosterPersonStatusBadge
            status={toRosterPersonStatus(professor.active)}
          />
        </div>
      ),
      filterValue: (professor) => buildProfessorStatusSummary(professor),
    },
  ];

  return (
    <ServerDataTable
      rows={loaderData.professors}
      columns={columns}
      getRowKey={(professor) => professor.id}
      // Only the administrator prints, and an archived professor never gets a
      // pass, so their row cannot be ticked.
      selectableRows={loaderData.canWrite}
      canSelectRow={(professor) => professor.active}
      selectedRowIds={selectedRowIds}
      onSelectedRowIdsChange={onSelectedRowIdsChange}
      searchPlaceholder="Buscar por nombre o documento"
      initialSearchValue={loaderData.filters.query}
      facetedFilters={buildProfessorFacetedFilters(loaderData)}
      initialFacetedFilterValues={buildInitialFacetedFilterValues(loaderData)}
      initialSort={loaderData.filters.order}
      emptyMessage={emptyProfessorList.nothingMatched}
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

function buildProfessorFacetedFilters(
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
      renderValue: (option) => (
        <Badge
          variant={getParticipationBadgeVariant(
            option.value === "si" ? "participating" : "not-participating",
          )}
        >
          {option.label}
        </Badge>
      ),
    });
  }

  groups.push({
    id: "estado",
    label: "Estado de alta",
    options: [
      { label: "Archivado", value: "archivados" },
      { label: "Todos", value: "todos" },
    ],
    // `Todos` is no status of a row, so only `Archivado` reads as a badge.
    renderValue: (option) =>
      option.value === "archivados" ? (
        <RosterPersonStatusBadge status="archived" />
      ) : (
        option.label
      ),
  });

  return [...groups];
}

function buildProfessorStatusSummary(professor: ProfessorRow) {
  const values: string[] = [];

  if (professor.participationStatus !== "no-event") {
    values.push(getParticipationLabel(professor.participationStatus));
  }

  if (!professor.active) {
    values.push(getRosterPersonStatusLabel("archived"));
  }

  return values.join(" ");
}

function buildProfessorDetailHref(loaderData: LoaderData, professorId: string) {
  return `/administracion/profesores/${professorId}${buildDetailSearch(loaderData)}`;
}

function buildDetailSearch(loaderData: LoaderData) {
  const search = buildProfessorListSearch(
    loaderData.filters,
    loaderData.selectedEventId,
  );

  return search.length > 0 ? `?${search}` : "";
}

function buildInitialFacetedFilterValues(loaderData: LoaderData) {
  const filters = getSelectedFilterValues(loaderData);

  return Object.keys(filters).length > 0 ? { filters } : undefined;
}

function getSelectedFilterValues(loaderData: LoaderData) {
  return activeListFacets(
    toProfessorListFacets(loaderData.filters, loaderData.selectedEventId),
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

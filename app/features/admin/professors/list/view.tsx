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
  getAdminProfessorParticipationLabel,
  type AdminProfessorParticipationStatus,
  toAdminProfessorParticipationSearchValue,
  toAdminProfessorStatusSearchValue,
} from "@/lib/admin/professors/professors.shared";

import type { loadAdministrativeProfessorsList } from "./server";

type LoaderData = Awaited<ReturnType<typeof loadAdministrativeProfessorsList>>;
type ProfessorRow = LoaderData["professors"][number];
type FacetedFilterGroup = DataTableFacetedFilter;

export type AdministracionProfesoresRouteViewProps = {
  loaderData: LoaderData;
};

export function AdministracionProfesoresRouteView({
  loaderData,
}: AdministracionProfesoresRouteViewProps) {
  const shouldShowTable =
    loaderData.professors.length > 0 ||
    hasActiveListFilters(loaderData) ||
    loaderData.hasAnyProfessor;

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Profesores"
      description="Consultá la ficha administrativa de cada profesor y revisá su estado operativo desde el listado."
      requireSelectedEvent={false}
    >
      {shouldShowTable ? (
        <ProfessorTable loaderData={loaderData} />
      ) : (
        <AdminEmptyState
          title="Todavía no hay Profesores para mostrar."
          description={
            loaderData.selectedEventId
              ? "Ajustá los filtros para revisar otros registros del Evento activo."
              : "Cuando haya profesores activos vas a poder revisarlos desde este listado."
          }
        />
      )}
    </AdminResourceLayout>
  );
}

function ProfessorTable({ loaderData }: { loaderData: LoaderData }) {
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
          {loaderData.selectedEventId ? (
            <ParticipationBadge
              participationStatus={professor.participationStatus}
            />
          ) : null}
          {!professor.active ? (
            <Badge variant="destructive">Archivado</Badge>
          ) : null}
        </div>
      ),
      filterValue: (professor) =>
        buildProfessorStatusSummary(professor, loaderData.selectedEventId),
    },
  ];

  return (
    <ServerDataTable
      rows={loaderData.professors}
      columns={columns}
      getRowKey={(professor) => professor.id}
      pageParamName="pagina"
      searchParamName="busqueda"
      sortParamName="orden"
      searchPlaceholder="Buscar profesor por nombre, número de documento o academia"
      initialSearchValue={loaderData.filters.query}
      facetedFilters={buildProfessorFacetedFilters(loaderData)}
      initialFacetedFilterValues={buildInitialFacetedFilterValues(loaderData)}
      initialSort={{
        columnId: "nombre",
        direction: loaderData.filters.nameOrder,
      }}
      emptyMessage="No hay Profesores que coincidan con la búsqueda o los filtros."
      currentPage={loaderData.filters.page}
      totalPages={loaderData.totalPages}
      totalRows={loaderData.totalCount}
    />
  );
}

function ParticipationBadge({
  participationStatus,
}: {
  participationStatus: AdminProfessorParticipationStatus;
}) {
  const variant =
    participationStatus === "participating" ? "success" : "secondary";

  return (
    <Badge variant={variant}>
      {getAdminProfessorParticipationLabel(participationStatus)}
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
    });
  }

  groups.push({
    id: "estado",
    label: "Archivo",
    options: [{ label: "Archivado", value: "archivados" }],
  });

  return [...groups];
}

function buildProfessorStatusSummary(
  professor: ProfessorRow,
  selectedEventId: string | null,
) {
  const values: string[] = [];

  if (selectedEventId !== null) {
    values.push(
      getAdminProfessorParticipationLabel(professor.participationStatus),
    );
  }

  if (!professor.active) {
    values.push("Archivado");
  }

  return values.join(" ");
}

function buildProfessorDetailHref(loaderData: LoaderData, professorId: string) {
  return `/administracion/profesores/${professorId}${buildDetailSearch(loaderData)}`;
}

function buildDetailSearch(loaderData: LoaderData) {
  const searchParams = new URLSearchParams();

  if (loaderData.filters.query.length > 0) {
    searchParams.set("busqueda", loaderData.filters.query);
  }

  if (loaderData.filters.nameOrder === "desc") {
    searchParams.set("orden", "nombre:desc");
  }

  const selectedFilters = getSelectedFilterValues(loaderData);

  if (selectedFilters.participando) {
    searchParams.set("participando", selectedFilters.participando);
  }

  if (selectedFilters.estado) {
    searchParams.set("estado", selectedFilters.estado);
  }

  if (loaderData.filters.page > 1) {
    searchParams.set("pagina", String(loaderData.filters.page));
  }

  const search = searchParams.toString();

  return search.length > 0 ? `?${search}` : "";
}

function buildInitialFacetedFilterValues(loaderData: LoaderData) {
  const filters = getSelectedFilterValues(loaderData);

  return Object.keys(filters).length > 0 ? { filters } : undefined;
}

function getSelectedFilterValues(loaderData: LoaderData) {
  const values: Record<string, string> = {};
  const statusValue = toAdminProfessorStatusSearchValue(
    loaderData.filters.status,
  );

  if (statusValue === "archivados") {
    values.estado = statusValue;
  }

  const participationValue = toAdminProfessorParticipationSearchValue(
    loaderData.filters.participation,
  );

  if (loaderData.selectedEventId !== null && participationValue !== "todos") {
    values.participando = participationValue;
  }

  return values;
}

function hasActiveListFilters(loaderData: LoaderData) {
  const selectedFilters = getSelectedFilterValues(loaderData);

  return (
    loaderData.filters.query.length > 0 ||
    loaderData.filters.page > 1 ||
    Object.keys(selectedFilters).length > 0
  );
}

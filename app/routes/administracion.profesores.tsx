import { Link, redirect } from "react-router";

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
  getAdminProfessorParticipationLabel,
  type AdminProfessorParticipationStatus,
  toAdminProfessorParticipationSearchValue,
  toAdminProfessorStatusSearchValue,
} from "@/lib/admin/professors/professors.shared";
import { loadAdminEventContext } from "@/lib/admin/event-context.server";
import {
  listAdministrativeProfessors,
  readAdministrativeProfessorFilters,
} from "@/lib/admin/professors/professors.server";
import type { AdminRouteHandle } from "@/components/admin/shell";
import { requireInternalUser } from "@/lib/auth/internal-access.server";

import type { Route } from "./+types/administracion.profesores";

type LoaderData = Awaited<ReturnType<typeof loader>>;
type ProfessorRow = LoaderData["professors"][number];
type FacetedFilterGroup = DataTableFacetedFilter["groups"][number];

type AdministracionProfesoresRouteProps = {
  loaderData: LoaderData;
};

export const meta: Route.MetaFunction = () => [
  { title: "Profesores | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [{ label: "Profesores" }],
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  await requireInternalUser(request, ["admin", "auditor"]);
  const eventContext = await loadAdminEventContext(request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  const filters = readAdministrativeProfessorFilters(
    new URL(request.url).searchParams,
    {
      hasSelectedEvent: eventContext.selectedEventId !== null,
    },
  );
  const listResult = await listAdministrativeProfessors({
    selectedEventId: eventContext.selectedEventId,
    filters,
  });

  return {
    selectedEventId: eventContext.selectedEventId,
    filters: listResult.filters,
    hasAnyProfessor: listResult.hasAnyProfessor,
    professors: listResult.items,
    totalCount: listResult.totalCount,
    totalPages: listResult.totalPages,
  };
}

export function AdministracionProfesoresRouteView({
  loaderData,
}: AdministracionProfesoresRouteProps) {
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

export default function AdministracionProfesoresRoute({
  loaderData,
}: AdministracionProfesoresRouteProps) {
  return <AdministracionProfesoresRouteView loaderData={loaderData} />;
}

function ProfessorTable({ loaderData }: { loaderData: LoaderData }) {
  const columns: DataTableColumn<ProfessorRow>[] = [
    {
      id: "nombre",
      header: "Nombre",
      className: "w-1/4 font-medium",
      headerClassName: "w-1/4",
      cell: (professor) => (
        <Link
          to={buildProfessorDetailHref(loaderData, professor.id)}
          className="text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {professor.firstName} {professor.lastName}
        </Link>
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
      className: "w-1/2",
      headerClassName: "w-1/2",
      cell: (professor) => (
        <div className="flex flex-wrap gap-2">
          {loaderData.selectedEventId ? (
            <ParticipationBadge
              participationStatus={professor.participationStatus}
            />
          ) : null}
          {!professor.active ? (
            <Badge variant="secondary">Archivado</Badge>
          ) : null}
        </div>
      ),
      filterValue: (professor) =>
        buildProfessorStatusSummary(professor, loaderData.selectedEventId),
    },
  ];

  return (
    <DataTable
      mode="server"
      rows={loaderData.professors}
      columns={columns}
      getRowKey={(professor) => professor.id}
      searchPlaceholder="Buscar por nombre, documento o academia"
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
    participationStatus === "participating" ? "outline" : "secondary";

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

  return [
    {
      columnId: "filters",
      label: "Filtros",
      groups,
    },
  ];
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
  const searchParams = buildSearchParams(loaderData);
  const search = searchParams.toString();

  return search.length > 0 ? `?${search}` : "";
}

function buildSearchParams(loaderData: LoaderData) {
  const searchParams = new URLSearchParams();

  if (loaderData.filters.query.length > 0) {
    searchParams.set("q", loaderData.filters.query);
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

  if (loaderData.filters.page > 1) {
    searchParams.set("page", String(loaderData.filters.page));
  }

  return searchParams;
}

function buildInitialFacetedFilterValues(loaderData: LoaderData) {
  const values = getSelectedFilterValues(loaderData);

  return Object.keys(values).length > 0 ? { filters: values } : undefined;
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
  const participationValue = toAdminProfessorParticipationSearchValue(
    loaderData.filters.participation,
  );
  const statusValue = toAdminProfessorStatusSearchValue(
    loaderData.filters.status,
  );

  return (
    loaderData.filters.query.length > 0 ||
    loaderData.filters.page > 1 ||
    (loaderData.selectedEventId !== null && participationValue !== "todos") ||
    statusValue === "archivados"
  );
}

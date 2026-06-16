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
import { requireInternalUser } from "@/lib/auth/internal-access.server";

import type { Route } from "./+types/administracion_.profesores";

type LoaderData = Awaited<ReturnType<typeof loader>>;
type ProfessorRow = LoaderData["professors"][number];

type AdministracionProfesoresRouteProps = {
  loaderData: LoaderData;
};

export const meta: Route.MetaFunction = () => [
  { title: "Profesores | Panel de administración | En Escena" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireInternalUser(request, ["admin", "auditor"]);
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
    email: user.email,
    events: eventContext.events,
    selectedEventId: eventContext.selectedEventId,
    filters: listResult.filters,
    professors: listResult.items,
    totalCount: listResult.totalCount,
    totalPages: listResult.totalPages,
  };
}

export function AdministracionProfesoresRouteView({
  loaderData,
}: AdministracionProfesoresRouteProps) {
  const shouldShowTable =
    loaderData.professors.length > 0 || hasActiveListFilters(loaderData);

  return (
    <AdminResourceLayout
      loaderData={loaderData}
      title="Profesores"
      description="Consultá la ficha administrativa de cada profesor y revisá su estado operativo desde un único listado."
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
      id: "professor",
      header: "Profesor",
      className: "font-medium",
      cell: (professor) => (
        <Link
          to={buildProfessorDetailHref(loaderData, professor.id)}
          className="text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {professor.lastName}, {professor.firstName}
        </Link>
      ),
      filterValue: (professor) =>
        `${professor.lastName} ${professor.firstName}`,
      sortValue: (professor) => `${professor.lastName}, ${professor.firstName}`,
    },
    {
      id: "academy",
      header: "Academia",
      cell: (professor) => professor.academyName,
      filterValue: (professor) => professor.academyName,
      sortValue: (professor) => professor.academyName,
    },
    {
      id: "status",
      header: "Estado",
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
          <IdentificationBadge
            identificationStatus={professor.identificationStatus}
          />
        </div>
      ),
      filterValue: (professor) =>
        buildProfessorStatusSummary(professor, loaderData.selectedEventId),
      sortValue: (professor) =>
        buildProfessorStatusSummary(professor, loaderData.selectedEventId),
    },
  ];

  return (
    <DataTable
      rows={loaderData.professors}
      columns={columns}
      getRowKey={(professor) => professor.id}
      searchPlaceholder="Buscar por nombre, documento o academia"
      initialSearchValue={loaderData.filters.query}
      facetedFilters={buildProfessorFacetedFilters(loaderData)}
      initialFacetedFilterValues={buildInitialFacetedFilterValues(loaderData)}
      emptyMessage="No hay Profesores que coincidan con la búsqueda."
      serverSide={{
        currentPage: loaderData.filters.page,
        totalPages: loaderData.totalPages,
        totalRows: loaderData.totalCount,
      }}
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

function IdentificationBadge({
  identificationStatus,
}: {
  identificationStatus: ProfessorRow["identificationStatus"];
}) {
  return (
    <Badge
      variant={identificationStatus === "complete" ? "default" : "secondary"}
    >
      {identificationStatus === "complete"
        ? "Identificación completa"
        : "Identificación incompleta"}
    </Badge>
  );
}

function buildProfessorFacetedFilters(
  loaderData: LoaderData,
): DataTableFacetedFilter[] {
  const groups = [];

  if (loaderData.selectedEventId !== null) {
    groups.push({
      id: "participando",
      label: "Participación",
      options: [{ label: "No participando", value: "no" }],
    });
  }

  groups.push({
    id: "estado",
    label: "Estado",
    options: [{ label: "Archivados", value: "archivados" }],
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
  const values = [];

  if (selectedEventId !== null) {
    values.push(
      getAdminProfessorParticipationLabel(professor.participationStatus),
    );
  }

  if (!professor.active) {
    values.push("Archivado");
  }

  values.push(
    professor.identificationStatus === "complete"
      ? "Identificación completa"
      : "Identificación incompleta",
  );

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
  return { filters: getSelectedFilterValues(loaderData) };
}

function getSelectedFilterValues(loaderData: LoaderData) {
  const values: Record<string, string> = {};
  const participationValue = toAdminProfessorParticipationSearchValue(
    loaderData.filters.participation,
  );
  const statusValue = toAdminProfessorStatusSearchValue(
    loaderData.filters.status,
  );

  if (loaderData.selectedEventId !== null && participationValue === "no") {
    values.participando = participationValue;
  }

  if (statusValue === "archivados") {
    values.estado = statusValue;
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
    (loaderData.selectedEventId !== null && participationValue === "no") ||
    statusValue === "archivados"
  );
}

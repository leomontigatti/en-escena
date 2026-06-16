import { Link, redirect } from "react-router";

import { AdminShell } from "@/components/admin/shell";
import { AdminEmptyState } from "@/components/admin/resource-layout";
import {
  DataTable,
  type DataTableColumn,
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
    eventOptions: eventContext.events,
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
  return (
    <AdminShell
      email={loaderData.email}
      events={loaderData.eventOptions}
      selectedEventId={loaderData.selectedEventId}
      title="Profesores"
    >
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">Profesores</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Consultá la ficha administrativa de cada Profesor sin editar desde
              el listado.
            </p>
          </div>
          <p className="text-sm text-slate-600">
            {formatResultCount(loaderData.totalCount)}
          </p>
        </div>

        {loaderData.professors.length > 0 ? (
          <ProfessorTable loaderData={loaderData} />
        ) : (
          <AdminEmptyState
            title="Todavía no hay Profesores para mostrar."
            description="Ajustá los filtros para revisar otros registros del Evento activo."
          />
        )}
      </section>
    </AdminShell>
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
          <Badge variant={professor.active ? "default" : "secondary"}>
            {professor.active ? "Activo" : "Archivado"}
          </Badge>
          <ParticipationBadge
            participationStatus={professor.participationStatus}
          />
        </div>
      ),
      filterValue: (professor) =>
        `${professor.active ? "Activo" : "Archivado"} ${getAdminProfessorParticipationLabel(
          professor.participationStatus,
        )}`,
      sortValue: (professor) =>
        `${professor.active ? "Activo" : "Archivado"} ${getAdminProfessorParticipationLabel(
          professor.participationStatus,
        )}`,
    },
  ];

  return (
    <DataTable
      rows={loaderData.professors}
      columns={columns}
      getRowKey={(professor) => professor.id}
      searchPlaceholder="Buscar por nombre, documento o academia"
      initialSearchValue={loaderData.filters.query}
      facetedFilters={[
        {
          columnId: "filters",
          label: "Filtros",
          groups: [
            {
              id: "participando",
              label: "Participación",
              options: [
                { label: "Sí", value: "si" },
                { label: "No", value: "no" },
                { label: "Todos", value: "todos" },
              ],
            },
            {
              id: "estado",
              label: "Estado",
              options: [
                { label: "Activos", value: "activos" },
                { label: "Archivados", value: "archivados" },
                { label: "Todos", value: "todos" },
              ],
            },
          ],
        },
      ]}
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

  const participationValue = toAdminProfessorParticipationSearchValue(
    loaderData.filters.participation,
  );
  const statusValue = toAdminProfessorStatusSearchValue(
    loaderData.filters.status,
  );

  if (participationValue !== "si" || loaderData.selectedEventId === null) {
    searchParams.set("participando", participationValue);
  }

  if (statusValue !== "activos") {
    searchParams.set("estado", statusValue);
  }

  if (loaderData.filters.page > 1) {
    searchParams.set("page", String(loaderData.filters.page));
  }

  return searchParams;
}

function formatResultCount(count: number) {
  return count === 1 ? "1 resultado" : `${count} resultados`;
}

function buildInitialFacetedFilterValues(loaderData: LoaderData) {
  const values: Record<string, string> = {};
  const participationValue = toAdminProfessorParticipationSearchValue(
    loaderData.filters.participation,
  );
  const statusValue = toAdminProfessorStatusSearchValue(
    loaderData.filters.status,
  );

  if (participationValue !== "si" || loaderData.selectedEventId === null) {
    values.participando = participationValue;
  }

  if (statusValue !== "activos") {
    values.estado = statusValue;
  }

  return { filters: values };
}

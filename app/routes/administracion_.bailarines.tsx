import { Link, redirect } from "react-router";

import { AdminShell } from "@/components/admin/shell";
import { AdminEmptyState } from "@/components/admin/resource-layout";
import {
  DataTable,
  type DataTableColumn,
  type DataTableFacetedFilter,
} from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import {
  getAdminDancerIdentificationBadgeVariant,
  getAdminDancerIdentificationLabel,
  getAdminDancerParticipationBadgeVariant,
  getAdminDancerParticipationLabel,
  toAdminDancerIdentificationSearchValue,
  toAdminDancerParticipationSearchValue,
  toAdminDancerStatusSearchValue,
  type AdminDancerIdentificationStatus,
  type AdminDancerParticipationStatus,
} from "@/lib/admin/dancers/dancers.shared";
import { loadAdminEventContext } from "@/lib/admin/event-context.server";
import {
  listAdministrativeDancers,
  readAdministrativeDancerFilters,
} from "@/lib/admin/dancers/dancers.server";
import { requireInternalUser } from "@/lib/auth/internal-access.server";

import type { Route } from "./+types/administracion_.bailarines";

type LoaderData = Awaited<ReturnType<typeof loader>>;
type DancerRow = LoaderData["dancers"][number];

type AdministracionBailarinesRouteProps = {
  loaderData: LoaderData;
};

const dancerFacetedFilters: DataTableFacetedFilter[] = [
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
      {
        id: "identificacion",
        label: "Identificación",
        options: [
          { label: "Incompleta", value: "incompleta" },
          { label: "Para verificar", value: "para-verificar" },
          { label: "Verificados", value: "verificados" },
          { label: "Todos", value: "todos" },
        ],
      },
    ],
  },
];

export const meta: Route.MetaFunction = () => [
  { title: "Bailarines | Panel de administración | En Escena" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireInternalUser(request, ["admin", "auditor"]);
  const eventContext = await loadAdminEventContext(request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  const filters = readAdministrativeDancerFilters(
    new URL(request.url).searchParams,
    {
      hasSelectedEvent: eventContext.selectedEventId !== null,
    },
  );
  const listResult = await listAdministrativeDancers({
    selectedEventId: eventContext.selectedEventId,
    filters,
  });

  return {
    email: user.email,
    eventOptions: eventContext.events,
    selectedEventId: eventContext.selectedEventId,
    filters: listResult.filters,
    dancers: listResult.items,
    totalCount: listResult.totalCount,
    totalPages: listResult.totalPages,
  };
}

export function AdministracionBailarinesRouteView({
  loaderData,
}: AdministracionBailarinesRouteProps) {
  const shouldShowTable =
    loaderData.dancers.length > 0 || hasActiveListFilters(loaderData);

  return (
    <AdminShell
      email={loaderData.email}
      events={loaderData.eventOptions}
      selectedEventId={loaderData.selectedEventId}
      title="Bailarines"
    >
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">Bailarines</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Consultá la ficha administrativa de cada Bailarín sin editar desde
              el listado.
            </p>
          </div>
          <p className="text-sm text-slate-600">
            {formatResultCount(loaderData.totalCount)}
          </p>
        </div>

        {shouldShowTable ? (
          <DancerTable loaderData={loaderData} />
        ) : (
          <AdminEmptyState
            title="Todavía no hay Bailarines para mostrar."
            description="Ajustá los filtros para revisar otros registros del Evento activo."
          />
        )}
      </section>
    </AdminShell>
  );
}

export default function AdministracionBailarinesRoute({
  loaderData,
}: AdministracionBailarinesRouteProps) {
  return <AdministracionBailarinesRouteView loaderData={loaderData} />;
}
function DancerTable({ loaderData }: { loaderData: LoaderData }) {
  const columns: DataTableColumn<DancerRow>[] = [
    {
      id: "dancer",
      header: "Bailarín",
      className: "font-medium",
      cell: (dancer) => (
        <Link
          to={buildDancerDetailHref(loaderData, dancer.id)}
          className="text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {dancer.lastName}, {dancer.firstName}
        </Link>
      ),
      filterValue: (dancer) => `${dancer.lastName} ${dancer.firstName}`,
      sortValue: (dancer) => `${dancer.lastName}, ${dancer.firstName}`,
    },
    {
      id: "academy",
      header: "Academia",
      cell: (dancer) => dancer.academyName,
      filterValue: (dancer) => dancer.academyName,
      sortValue: (dancer) => dancer.academyName,
    },
    {
      id: "status",
      header: "Estado",
      cell: (dancer) => (
        <div className="flex flex-wrap gap-2">
          <Badge variant={dancer.active ? "default" : "secondary"}>
            {dancer.active ? "Activo" : "Archivado"}
          </Badge>
          <ParticipationBadge
            participationStatus={dancer.participationStatus}
          />
        </div>
      ),
      filterValue: (dancer) =>
        `${dancer.active ? "Activo" : "Archivado"} ${getAdminDancerParticipationLabel(
          dancer.participationStatus,
        )}`,
      sortValue: (dancer) =>
        `${dancer.active ? "Activo" : "Archivado"} ${getAdminDancerParticipationLabel(
          dancer.participationStatus,
        )}`,
    },
    {
      id: "identification",
      header: "Identificación",
      cell: (dancer) => (
        <IdentificationBadge
          identificationStatus={dancer.identificationStatus}
        />
      ),
      filterValue: (dancer) =>
        getAdminDancerIdentificationLabel(dancer.identificationStatus),
      sortValue: (dancer) =>
        getAdminDancerIdentificationLabel(dancer.identificationStatus),
    },
  ];

  return (
    <DataTable
      rows={loaderData.dancers}
      columns={columns}
      getRowKey={(dancer) => dancer.id}
      searchPlaceholder="Buscar por nombre, documento o academia"
      initialSearchValue={loaderData.filters.query}
      facetedFilters={dancerFacetedFilters}
      initialFacetedFilterValues={buildInitialFacetedFilterValues(loaderData)}
      emptyMessage="No hay Bailarines que coincidan con la búsqueda."
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
      {getAdminDancerIdentificationLabel(identificationStatus)}
    </Badge>
  );
}

function buildDancerDetailHref(loaderData: LoaderData, dancerId: string) {
  return `/administracion/bailarines/${dancerId}${buildDetailSearch(loaderData)}`;
}

function buildDetailSearch(loaderData: LoaderData) {
  const searchParams = buildSearchParams(loaderData, loaderData.filters.page);
  const search = searchParams.toString();

  return search.length > 0 ? `?${search}` : "";
}

function buildSearchParams(loaderData: LoaderData, page: number) {
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

  if (values.identificacion) {
    searchParams.set("identificacion", values.identificacion);
  }

  if (page > 1) {
    searchParams.set("page", String(page));
  }

  return searchParams;
}

function formatResultCount(totalCount: number) {
  return `${totalCount} ${totalCount === 1 ? "resultado" : "resultados"}`;
}

function buildInitialFacetedFilterValues(loaderData: LoaderData) {
  return { filters: getSelectedFilterValues(loaderData) };
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

  if (participationValue !== "si" || loaderData.selectedEventId === null) {
    values.participando = participationValue;
  }

  if (statusValue !== "activos") {
    values.estado = statusValue;
  }

  if (identificationValue !== "todos") {
    values.identificacion = identificationValue;
  }

  return values;
}

function hasActiveListFilters(loaderData: LoaderData) {
  const defaultParticipationValue =
    loaderData.selectedEventId === null ? "todos" : "si";
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
    participationValue !== defaultParticipationValue ||
    statusValue !== "activos" ||
    identificationValue !== "todos"
  );
}

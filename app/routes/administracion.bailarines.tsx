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
  getAdminDancerIdentificationBadgeVariant,
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
import type { AdminRouteHandle } from "@/components/admin/shell";
import { requireInternalUser } from "@/lib/auth/internal-access.server";

import type { Route } from "./+types/administracion.bailarines";

type LoaderData = Awaited<ReturnType<typeof loader>>;
type DancerRow = LoaderData["dancers"][number];
type FacetedFilterGroup = DataTableFacetedFilter["groups"][number];

type AdministracionBailarinesRouteProps = {
  loaderData: LoaderData;
};

export const meta: Route.MetaFunction = () => [
  { title: "Bailarines | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [{ label: "Bailarines" }],
} satisfies AdminRouteHandle;

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
    events: eventContext.events,
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
    <AdminResourceLayout
      loaderData={loaderData}
      title="Bailarines"
      description="Consultá la ficha administrativa de cada bailarín y priorizá la revisión documental desde el listado."
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
          {loaderData.selectedEventId ? (
            <ParticipationBadge
              participationStatus={dancer.participationStatus}
            />
          ) : null}
          {!dancer.active ? <Badge variant="secondary">Archivado</Badge> : null}
          <IdentificationBadge
            identificationStatus={dancer.identificationStatus}
          />
        </div>
      ),
      filterValue: (dancer) =>
        buildDancerStatusSummary(dancer, loaderData.selectedEventId),
      sortValue: (dancer) =>
        buildDancerStatusSummary(dancer, loaderData.selectedEventId),
    },
  ];

  return (
    <DataTable
      rows={loaderData.dancers}
      columns={columns}
      getRowKey={(dancer) => dancer.id}
      searchPlaceholder="Buscar por nombre, documento o academia"
      initialSearchValue={loaderData.filters.query}
      facetedFilters={buildDancerFacetedFilters(loaderData)}
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
    <Badge variant={getIdentificationBadgeVariant(identificationStatus)}>
      {getGroupedDancerIdentificationLabel(identificationStatus)}
    </Badge>
  );
}

function getIdentificationBadgeVariant(
  identificationStatus: AdminDancerIdentificationStatus,
) {
  return getAdminDancerIdentificationBadgeVariant(identificationStatus);
}

function getGroupedDancerIdentificationLabel(
  identificationStatus: AdminDancerIdentificationStatus,
) {
  switch (identificationStatus) {
    case "pending-verification":
      return "Para verificar";
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
      options: [{ label: "No participando", value: "no" }],
    });
  }

  groups.push(
    {
      id: "estado",
      label: "Estado",
      options: [{ label: "Archivados", value: "archivados" }],
    },
    {
      id: "identificacion",
      label: "Identificación",
      options: [
        { label: "Incompletos", value: "incompleta" },
        { label: "Para verificar", value: "para-verificar" },
        { label: "Verificados", value: "verificados" },
      ],
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

  if (loaderData.selectedEventId !== null && participationValue === "no") {
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
    (loaderData.selectedEventId !== null && participationValue === "no") ||
    statusValue === "archivados" ||
    identificationValue !== "todos"
  );
}

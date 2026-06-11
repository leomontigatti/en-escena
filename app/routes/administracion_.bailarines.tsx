import { Link, redirect } from "react-router";

import { AdminShell } from "@/components/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  adminDancerPageSize,
  getAdminDancerIdentificationBadgeVariant,
  getAdminDancerIdentificationLabel,
  getAdminDancerParticipationBadgeVariant,
  getAdminDancerParticipationLabel,
  toAdminDancerIdentificationSearchValue,
  toAdminDancerParticipationSearchValue,
  toAdminDancerStatusSearchValue,
  type AdminDancerIdentificationStatus,
  type AdminDancerParticipationStatus,
} from "@/lib/admin-dancers.shared";
import { loadAdminEventContext } from "@/lib/admin-event-context.server";
import {
  listAdministrativeDancers,
  readAdministrativeDancerFilters,
} from "@/lib/admin-dancers.server";
import { requireInternalUser } from "@/lib/internal-access.server";

import type { Route } from "./+types/administracion_.bailarines";

type LoaderData = Awaited<ReturnType<typeof loader>>;

type AdministracionBailarinesRouteProps = {
  loaderData: LoaderData;
};

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
  return (
    <AdminShell
      email={loaderData.email}
      events={loaderData.eventOptions}
      selectedEventId={loaderData.selectedEventId}
      title="Bailarines"
    >
      <section className="space-y-4">
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
            {renderPageSummary(loaderData)}
          </p>
        </div>

        <DancerFilters loaderData={loaderData} />

        {loaderData.dancers.length > 0 ? (
          <>
            <DancerTable loaderData={loaderData} />
            <DancerPagination loaderData={loaderData} />
          </>
        ) : (
          <EmptyDancerState />
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

function DancerFilters({ loaderData }: { loaderData: LoaderData }) {
  return (
    <form
      method="get"
      className="grid gap-4 rounded-lg border bg-background p-4 xl:grid-cols-[minmax(0,1fr)_220px_220px_220px_auto]"
    >
      <input
        type="hidden"
        name="evento"
        value={loaderData.selectedEventId ?? ""}
      />
      <label className="grid gap-2 text-sm font-medium text-slate-900">
        Buscar
        <input
          type="search"
          name="q"
          defaultValue={loaderData.filters.query}
          placeholder="Nombre, documento o academia"
          className="h-10 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none transition focus:border-primary focus:ring-4 focus:ring-ring"
        />
      </label>
      <label className="grid gap-2 text-sm font-medium text-slate-900">
        Participando
        <select
          name="participando"
          defaultValue={toAdminDancerParticipationSearchValue(
            loaderData.filters.participation,
          )}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none transition focus:border-primary focus:ring-4 focus:ring-ring"
        >
          <option value="si">Sí</option>
          <option value="no">No</option>
          <option value="todos">Todos</option>
        </select>
      </label>
      <label className="grid gap-2 text-sm font-medium text-slate-900">
        Estado
        <select
          name="estado"
          defaultValue={toAdminDancerStatusSearchValue(
            loaderData.filters.status,
          )}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none transition focus:border-primary focus:ring-4 focus:ring-ring"
        >
          <option value="activos">Activos</option>
          <option value="archivados">Archivados</option>
          <option value="todos">Todos</option>
        </select>
      </label>
      <label className="grid gap-2 text-sm font-medium text-slate-900">
        Identificación
        <select
          name="identificacion"
          defaultValue={toAdminDancerIdentificationSearchValue(
            loaderData.filters.identification,
          )}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none transition focus:border-primary focus:ring-4 focus:ring-ring"
        >
          <option value="incompleta">Incompleta</option>
          <option value="sin-imagenes">Sin imágenes</option>
          <option value="todos">Todos</option>
        </select>
      </label>
      <div className="flex items-end">
        <Button type="submit" className="w-full sm:w-auto">
          Aplicar filtros
        </Button>
      </div>
    </form>
  );
}

function DancerTable({ loaderData }: { loaderData: LoaderData }) {
  return (
    <div className="rounded-lg border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Bailarín</TableHead>
            <TableHead>Academia</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Identificación</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loaderData.dancers.map((dancer) => (
            <TableRow key={dancer.id}>
              <TableCell className="font-medium">
                <Link
                  to={buildDancerDetailHref(loaderData, dancer.id)}
                  className="text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  {dancer.lastName}, {dancer.firstName}
                </Link>
              </TableCell>
              <TableCell>{dancer.academyName}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={dancer.active ? "default" : "secondary"}>
                    {dancer.active ? "Activo" : "Archivado"}
                  </Badge>
                  <ParticipationBadge
                    participationStatus={dancer.participationStatus}
                  />
                </div>
              </TableCell>
              <TableCell>
                <IdentificationBadge
                  identificationStatus={dancer.identificationStatus}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function DancerPagination({ loaderData }: { loaderData: LoaderData }) {
  if (loaderData.totalPages <= 1) {
    return null;
  }

  const previousPage = loaderData.filters.page - 1;
  const nextPage = loaderData.filters.page + 1;

  return (
    <nav
      className="flex items-center justify-between gap-3"
      aria-label="Paginación de Bailarines"
    >
      {previousPage >= 1 ? (
        <Button asChild variant="outline">
          <Link to={buildListHref(loaderData, previousPage)}>
            Página anterior
          </Link>
        </Button>
      ) : (
        <span />
      )}
      <span className="text-sm text-slate-600">
        Mostrando {loaderData.dancers.length} de {loaderData.totalCount}{" "}
        resultados
      </span>
      {nextPage <= loaderData.totalPages ? (
        <Button asChild variant="outline">
          <Link to={buildListHref(loaderData, nextPage)}>Página siguiente</Link>
        </Button>
      ) : (
        <span />
      )}
    </nav>
  );
}

function EmptyDancerState() {
  return (
    <div className="rounded-lg border border-dashed bg-background px-5 py-8">
      <h3 className="text-base font-semibold text-slate-950">
        Todavía no hay Bailarines para mostrar.
      </h3>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
        Ajustá los filtros o cambiá el evento de trabajo para revisar otros
        registros.
      </p>
    </div>
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

function buildListHref(loaderData: LoaderData, page: number) {
  const searchParams = buildSearchParams(loaderData, page);
  const search = searchParams.toString();

  return `/administracion/bailarines${search.length > 0 ? `?${search}` : ""}`;
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

  if (loaderData.selectedEventId) {
    searchParams.set("evento", loaderData.selectedEventId);
  }

  if (loaderData.filters.query.length > 0) {
    searchParams.set("q", loaderData.filters.query);
  }

  searchParams.set(
    "participando",
    toAdminDancerParticipationSearchValue(loaderData.filters.participation),
  );
  searchParams.set(
    "estado",
    toAdminDancerStatusSearchValue(loaderData.filters.status),
  );
  searchParams.set(
    "identificacion",
    toAdminDancerIdentificationSearchValue(loaderData.filters.identification),
  );

  if (page > 1) {
    searchParams.set("page", String(page));
  }

  return searchParams;
}

function formatResultCount(totalCount: number) {
  return `${totalCount} ${totalCount === 1 ? "resultado" : "resultados"}`;
}

function renderPageSummary(loaderData: LoaderData) {
  if (loaderData.totalCount === 0) {
    return null;
  }

  const pageStart = (loaderData.filters.page - 1) * adminDancerPageSize + 1;
  const pageEnd = pageStart + loaderData.dancers.length - 1;

  return ` · Página ${loaderData.filters.page} de ${loaderData.totalPages} (${pageStart}-${pageEnd})`;
}

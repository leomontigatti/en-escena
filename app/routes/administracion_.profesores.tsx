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
  adminProfessorPageSize,
  type AdminProfessorParticipationStatus,
} from "@/lib/admin-professors.shared";
import { loadAdminEventContext } from "@/lib/admin-event-context.server";
import {
  listAdministrativeProfessors,
  readAdministrativeProfessorFilters,
} from "@/lib/admin-professors.server";
import { requireInternalUser } from "@/lib/internal-access.server";

import type { Route } from "./+types/administracion_.profesores";

type LoaderData = Awaited<ReturnType<typeof loader>>;

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
      <section className="space-y-4">
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
            {loaderData.totalCount > adminProfessorPageSize
              ? ` · Página ${loaderData.filters.page} de ${loaderData.totalPages}`
              : ""}
          </p>
        </div>

        <ProfessorFilters loaderData={loaderData} />

        {loaderData.professors.length > 0 ? (
          <>
            <ProfessorTable loaderData={loaderData} />
            <ProfessorPagination loaderData={loaderData} />
          </>
        ) : (
          <EmptyProfessorState />
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

function ProfessorFilters({ loaderData }: { loaderData: LoaderData }) {
  return (
    <form
      method="get"
      className="grid gap-4 rounded-lg border bg-background p-4 lg:grid-cols-[minmax(0,1fr)_220px_220px_auto]"
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
          defaultValue={toParticipationSearchValue(
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
          defaultValue={toStatusSearchValue(loaderData.filters.status)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none transition focus:border-primary focus:ring-4 focus:ring-ring"
        >
          <option value="activos">Activos</option>
          <option value="archivados">Archivados</option>
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

function ProfessorTable({ loaderData }: { loaderData: LoaderData }) {
  return (
    <div className="rounded-lg border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Profesor</TableHead>
            <TableHead>Academia</TableHead>
            <TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loaderData.professors.map((professor) => (
            <TableRow key={professor.id}>
              <TableCell className="font-medium">
                <Link
                  to={buildProfessorDetailHref(loaderData, professor.id)}
                  className="text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  {professor.lastName}, {professor.firstName}
                </Link>
              </TableCell>
              <TableCell>{professor.academyName}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={professor.active ? "default" : "secondary"}>
                    {professor.active ? "Activo" : "Archivado"}
                  </Badge>
                  <ParticipationBadge
                    participationStatus={professor.participationStatus}
                  />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ProfessorPagination({ loaderData }: { loaderData: LoaderData }) {
  if (loaderData.totalPages <= 1) {
    return null;
  }

  const previousPage = loaderData.filters.page - 1;
  const nextPage = loaderData.filters.page + 1;

  return (
    <nav
      className="flex items-center justify-between gap-3"
      aria-label="Paginación de Profesores"
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
        Mostrando {loaderData.professors.length} de {loaderData.totalCount}{" "}
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

function EmptyProfessorState() {
  return (
    <div className="rounded-lg border border-dashed bg-background px-5 py-8">
      <h3 className="text-base font-semibold text-slate-950">
        Todavía no hay Profesores para mostrar.
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
  participationStatus: AdminProfessorParticipationStatus;
}) {
  if (participationStatus === "participating") {
    return <Badge variant="outline">Participando</Badge>;
  }

  if (participationStatus === "not-participating") {
    return <Badge variant="secondary">No participando</Badge>;
  }

  return <Badge variant="secondary">Sin evento</Badge>;
}

function buildProfessorDetailHref(loaderData: LoaderData, professorId: string) {
  return `/administracion/profesores/${professorId}${buildDetailSearch(loaderData)}`;
}

function buildDetailSearch(loaderData: LoaderData) {
  const searchParams = buildSearchParams(loaderData);
  const search = searchParams.toString();

  return search.length > 0 ? `?${search}` : "";
}

function buildListHref(loaderData: LoaderData, page: number) {
  const searchParams = buildSearchParams(loaderData);
  searchParams.set("page", String(page));

  return `/administracion/profesores?${searchParams.toString()}`;
}

function buildSearchParams(loaderData: LoaderData) {
  const searchParams = new URLSearchParams();

  if (loaderData.selectedEventId) {
    searchParams.set("evento", loaderData.selectedEventId);
  }

  if (loaderData.filters.query.length > 0) {
    searchParams.set("q", loaderData.filters.query);
  }

  searchParams.set(
    "participando",
    toParticipationSearchValue(loaderData.filters.participation),
  );
  searchParams.set("estado", toStatusSearchValue(loaderData.filters.status));

  if (loaderData.filters.page > 1) {
    searchParams.set("page", String(loaderData.filters.page));
  }

  return searchParams;
}

function toParticipationSearchValue(
  value: LoaderData["filters"]["participation"],
) {
  if (value === "no") {
    return "no";
  }

  if (value === "all") {
    return "todos";
  }

  return "si";
}

function toStatusSearchValue(value: LoaderData["filters"]["status"]) {
  if (value === "archived") {
    return "archivados";
  }

  if (value === "all") {
    return "todos";
  }

  return "activos";
}

function formatResultCount(count: number) {
  return count === 1 ? "1 resultado" : `${count} resultados`;
}

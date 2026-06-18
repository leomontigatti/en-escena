import { Plus } from "lucide-react";
import { Link } from "react-router";

import type { AdminRouteHandle } from "@/components/admin/shell";
import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  listAdministrativeUsers,
  readAdministrativeUserFilters,
  type AdministrativeUserListItem,
  type AdministrativeUserListFilters,
  type AdministrativeUserListRole,
  type AdministrativeUserListState,
  type AdministrativeUserListType,
} from "@/lib/admin/users/users-list.server";
import { requireInternalUser } from "@/lib/auth/internal-access.server";

import type { Route } from "./+types/administracion.usuarios";

type LoaderData = Awaited<ReturnType<typeof loader>>;

type AdministracionUsuariosRouteProps = {
  loaderData: LoaderData;
};

type FilterSelectOption = {
  label: string;
  value: string;
};

const stateFilterOptions = [
  { label: "Activo", value: "active" },
  { label: "Cambio obligatorio", value: "mandatory-password-change" },
] satisfies FilterSelectOption[];

const typeFilterOptions = [
  { label: "Interno", value: "internal" },
  { label: "Academia", value: "academy" },
] satisfies FilterSelectOption[];

const archivedFilterOptions = [
  { label: "Archivado", value: "si" },
] satisfies FilterSelectOption[];

export const meta: Route.MetaFunction = () => [
  { title: "Usuarios | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [{ label: "Usuarios" }],
  adminShell: { showEventSelector: false },
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  const appUser = await requireInternalUser(request, ["admin", "auditor"]);
  const filters = readAdministrativeUserFilters(
    new URL(request.url).searchParams,
  );
  const users = await listAdministrativeUsers({ filters });

  return {
    canManage: appUser.role === "admin",
    filters,
    users,
  };
}

export function AdministracionUsuariosRouteView({
  loaderData,
}: AdministracionUsuariosRouteProps) {
  return (
    <AdminResourceLayout
      requireSelectedEvent={false}
      title="Usuarios"
      description="Consultá accesos internos y de academia con filtros por tipo, estado y archivo."
      headerAction={
        loaderData.canManage ? (
          <Button type="button" disabled>
            <Plus aria-hidden="true" data-icon />
            Nuevo usuario
          </Button>
        ) : undefined
      }
    >
      {loaderData.users.length > 0 ||
      hasActiveUserFilters(loaderData.filters) ? (
        <UsersTable filters={loaderData.filters} users={loaderData.users} />
      ) : (
        <AdminEmptyState
          title="No hay Usuarios para mostrar."
          description="Probá con otra búsqueda o ajustá los filtros para revisar otros accesos."
        />
      )}
    </AdminResourceLayout>
  );
}

function hasActiveUserFilters(filters: AdministrativeUserListFilters) {
  return (
    filters.query.length > 0 ||
    filters.archived ||
    filters.state !== "all" ||
    filters.type !== "all"
  );
}

export default function AdministracionUsuariosRoute({
  loaderData,
}: AdministracionUsuariosRouteProps) {
  return <AdministracionUsuariosRouteView loaderData={loaderData} />;
}

function UsersTable({
  filters,
  users,
}: {
  filters: AdministrativeUserListFilters;
  users: AdministrativeUserListItem[];
}) {
  const columns: DataTableColumn<AdministrativeUserListItem>[] = [
    {
      id: "name",
      header: "Nombre",
      className: "align-top whitespace-normal",
      cell: (savedUser) => (
        <div className="flex flex-col gap-1">
          <Link
            to={buildUserDetailHref(filters, savedUser.id)}
            className="w-fit font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {savedUser.name}
          </Link>
          {savedUser.academyName ? (
            <span className="text-xs text-muted-foreground">
              {savedUser.academyName}
            </span>
          ) : null}
        </div>
      ),
      filterValue: (savedUser) =>
        [savedUser.name, savedUser.academyName, savedUser.identifier]
          .filter(Boolean)
          .join(" "),
    },
    {
      id: "identifier",
      header: "Identificador",
      className: "align-top",
      cell: (savedUser) => (
        <code className="rounded bg-muted px-2 py-1 text-xs font-medium">
          {savedUser.identifier}
        </code>
      ),
      filterValue: (savedUser) => savedUser.identifier,
    },
    {
      id: "status",
      header: "Estado",
      className: "align-top whitespace-normal",
      cell: (savedUser) => (
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{getRoleLabel(savedUser.mainRole)}</Badge>
          <Badge variant="outline">{getTypeLabel(savedUser.userType)}</Badge>
          <Badge variant={getStateBadgeVariant(savedUser.state)}>
            {getStateLabel(savedUser.state)}
          </Badge>
        </div>
      ),
      filterValues: (savedUser) => [
        savedUser.userType,
        savedUser.state,
        savedUser.state === "suspended" ? "si" : "",
      ],
      filterValue: (savedUser) =>
        [
          getRoleLabel(savedUser.mainRole),
          getTypeLabel(savedUser.userType),
          getStateLabel(savedUser.state),
        ].join(" "),
    },
  ];

  return (
    <DataTable
      mode="server"
      rows={users}
      columns={columns}
      getRowKey={(savedUser) => savedUser.id}
      searchPlaceholder="Buscar usuario por nombre o identificador"
      initialSearchValue={filters.query}
      facetedFilters={[
        {
          columnId: "status",
          label: "Filtros",
          groups: [
            {
              id: "tipo",
              label: "Tipo",
              options: typeFilterOptions,
            },
            {
              id: "estado",
              label: "Estado",
              options: stateFilterOptions,
            },
            {
              id: "archivado",
              label: "Archivado",
              options: archivedFilterOptions,
            },
          ],
        },
      ]}
      initialFacetedFilterValues={buildInitialUserFilterValues(filters)}
      emptyMessage="No hay Usuarios que coincidan con la búsqueda o los filtros."
      currentPage={1}
      totalPages={1}
      totalRows={users.length}
    />
  );
}

function buildInitialUserFilterValues(
  filters: AdministrativeUserListFilters,
): Record<string, Record<string, string>> {
  const values: Record<string, string> = {};

  if (filters.state !== "all") {
    values.estado = filters.state;
  }

  if (filters.type !== "all") {
    values.tipo = filters.type;
  }

  if (filters.archived) {
    values.archivado = "si";
  }

  if (Object.keys(values).length === 0) {
    return {};
  }

  return { status: values };
}

function buildUserDetailHref(
  filters: AdministrativeUserListFilters,
  userId: string,
) {
  return `/administracion/usuarios/${userId}${buildDetailSearch(filters)}`;
}

function buildDetailSearch(filters: AdministrativeUserListFilters) {
  const searchParams = new URLSearchParams();

  if (filters.query.length > 0) {
    searchParams.set("q", filters.query);
  }

  if (filters.state !== "all") {
    searchParams.set("estado", filters.state);
  }

  if (filters.type !== "all") {
    searchParams.set("tipo", filters.type);
  }

  if (filters.archived) {
    searchParams.set("archivado", "si");
  }

  const search = searchParams.toString();

  return search.length > 0 ? `?${search}` : "";
}

function getRoleLabel(role: AdministrativeUserListRole) {
  switch (role) {
    case "admin":
      return "Administrador";
    case "auditor":
      return "Auditor";
    case "judge":
      return "Juez";
    case "academy":
      return "Academia";
  }
}

function getTypeLabel(type: AdministrativeUserListType) {
  switch (type) {
    case "internal":
      return "Interno";
    case "academy":
      return "Usuario de academia";
  }
}

function getStateLabel(state: AdministrativeUserListState) {
  switch (state) {
    case "active":
      return "Activo";
    case "mandatory-password-change":
      return "Cambio obligatorio";
    case "suspended":
      return "Archivado";
  }
}

function getStateBadgeVariant(state: AdministrativeUserListState) {
  switch (state) {
    case "active":
      return "default";
    case "mandatory-password-change":
      return "secondary";
    case "suspended":
      return "outline";
  }
}

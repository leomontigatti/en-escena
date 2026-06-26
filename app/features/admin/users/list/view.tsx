import { Plus } from "lucide-react";

import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  AdministrativeUserListFilters,
  AdministrativeUserListItem,
  AdministrativeUserListRole,
  AdministrativeUserListState,
  AdministrativeUserListType,
} from "@/lib/admin/users/users-list.server";

import type { loader } from "./server";

type LoaderData = Awaited<ReturnType<typeof loader>>;

type AdministracionUsuariosRouteViewProps = {
  loaderData: LoaderData;
};

type FilterSelectOption = {
  label: string;
  value: string;
};

const stateFilterOptions = [
  { label: "Activo", value: "active" },
  { label: "Cambio obligatorio", value: "mandatory-password-change" },
  { label: "Suspendido", value: "suspended" },
] satisfies FilterSelectOption[];

const roleFilterOptions = [
  { label: "Administrador", value: "admin" },
  { label: "Academia", value: "academy" },
  { label: "Auditor", value: "auditor" },
  { label: "Juez", value: "judge" },
] satisfies FilterSelectOption[];

export function AdministracionUsuariosRouteView({
  loaderData,
}: AdministracionUsuariosRouteViewProps) {
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
    filters.role !== "all" ||
    filters.state !== "all" ||
    filters.type !== "all"
  );
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
          <DataTableLink
            to={buildUserDetailHref(filters, savedUser.id)}
            className="w-fit"
          >
            {savedUser.name}
          </DataTableLink>
        </div>
      ),
      filterValue: (savedUser) =>
        [savedUser.name, savedUser.academyName, savedUser.identifier]
          .filter(Boolean)
          .join(" "),
    },
    {
      id: "academy",
      header: "Academia",
      className: "align-top whitespace-normal text-muted-foreground",
      cell: (savedUser) => <span>{savedUser.academyName ?? ""}</span>,
      filterValue: (savedUser) => savedUser.academyName ?? "",
    },
    {
      id: "status",
      header: "Estado",
      className: "align-top whitespace-normal",
      cell: (savedUser) => (
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{getRoleLabel(savedUser.mainRole)}</Badge>
          <Badge variant={getStateBadgeVariant(savedUser.state)}>
            {getStateLabel(savedUser.state)}
          </Badge>
        </div>
      ),
      filterValues: (savedUser) => [
        savedUser.mainRole,
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
      searchPlaceholder="Buscar usuario por nombre o email"
      initialSearchValue={filters.query}
      facetedFilters={[
        {
          columnId: "status",
          label: "Filtros",
          groups: [
            {
              id: "rol",
              label: "Rol",
              options: roleFilterOptions,
            },
            {
              id: "estado",
              label: "Estado",
              options: stateFilterOptions,
            },
            {
              id: "archivado",
              label: "Archivo",
              options: [{ label: "Archivado", value: "si" }],
            },
          ],
        },
      ]}
      initialFacetedFilterValues={buildInitialUserFilterValues(filters)}
      emptyMessage="No hay Usuarios que coincidan con la búsqueda o los filtros."
      currentPage={1}
      pageParamName="pagina"
      searchParamName="busqueda"
      totalPages={1}
      totalRows={users.length}
    />
  );
}

function buildInitialUserFilterValues(filters: AdministrativeUserListFilters) {
  return {
    status: {
      ...(filters.archived ? { archivado: "si" } : null),
      ...(filters.role !== "all" ? { rol: filters.role } : null),
      ...(filters.state !== "all" ? { estado: filters.state } : null),
    },
  };
}

function buildUserDetailHref(
  filters: AdministrativeUserListFilters,
  userId: string,
) {
  const searchParams = new URLSearchParams();

  if (filters.query.length > 0) {
    searchParams.set("busqueda", filters.query);
  }

  if (filters.archived) {
    searchParams.set("archivado", "si");
  }

  if (filters.role !== "all") {
    searchParams.set("rol", filters.role);
  }

  if (filters.state !== "all") {
    searchParams.set("estado", filters.state);
  }

  if (filters.type !== "all") {
    searchParams.set("tipo", filters.type);
  }

  const search = searchParams.toString();

  return search.length > 0
    ? `/administracion/usuarios/${userId}?${search}`
    : `/administracion/usuarios/${userId}`;
}

function getRoleLabel(role: AdministrativeUserListRole) {
  switch (role) {
    case "admin":
      return "Administrador";
    case "auditor":
      return "Auditor";
    case "judge":
      return "Juez";
    default:
      return "Academia";
  }
}

function getTypeLabel(type: AdministrativeUserListType) {
  return type === "internal" ? "Interno" : "Academia";
}

function getStateLabel(state: AdministrativeUserListState) {
  switch (state) {
    case "mandatory-password-change":
      return "Cambio obligatorio";
    case "suspended":
      return "Suspendido";
    default:
      return "Activo";
  }
}

function getStateBadgeVariant(state: AdministrativeUserListState) {
  switch (state) {
    case "mandatory-password-change":
      return "warning";
    case "suspended":
      return "destructive";
    default:
      return "success";
  }
}

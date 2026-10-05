import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import {
  ServerDataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { Badge } from "@/components/ui/badge";
import type {
  UserListFilters,
  UserListItem,
  UserListRole,
  UserListState,
  UserListType,
} from "@/lib/admin/users/users-list.shared";
import {
  buildUserListSearch,
  toUserListFacets,
} from "@/lib/admin/users/users-list.shared";
import {
  activeListFacets,
  describeEmptyList,
} from "@/lib/list-query/list-query";

import type { loader } from "./server";

type LoaderData = Awaited<ReturnType<typeof loader>>;

type InternalUsersListRouteViewProps = {
  loaderData: LoaderData;
};

type FilterSelectOption = {
  label: string;
  value: string;
};

const stateFilterOptions = [
  { label: "Activo", value: "active" },
  { label: "Suspendido", value: "suspended" },
] satisfies FilterSelectOption[];

const roleFilterOptions = [
  { label: "Administrador", value: "admin" },
  { label: "Academia", value: "academy" },
  { label: "Auditor", value: "auditor" },
  { label: "Juez", value: "judge" },
] satisfies FilterSelectOption[];

const emptyUserList = describeEmptyList("usuarios", "search-and-filters");

export function InternalUsersListRouteView({
  loaderData,
}: InternalUsersListRouteViewProps) {
  return (
    <AdminResourceLayout
      requireSelectedEvent={false}
      title="Usuarios"
      description="Consultá accesos internos y de academia con filtros por tipo, estado y archivo."
      action={
        loaderData.canManage
          ? { label: "Nuevo usuario", to: "/administracion/usuarios/nuevo" }
          : undefined
      }
    >
      {loaderData.users.length > 0 ||
      hasActiveUserFilters(loaderData.filters) ? (
        <UsersTable loaderData={loaderData} />
      ) : (
        <AdminEmptyState
          title={emptyUserList.nothingYet}
          description="Cuando se creen accesos internos o se registren academias, vas a poder revisarlos desde este listado."
        />
      )}
    </AdminResourceLayout>
  );
}

/**
 * Whether the reader narrowed this list rather than landed on it. The page
 * narrows nothing: a page past the last one is clamped.
 */
function hasActiveUserFilters(filters: UserListFilters) {
  return (
    filters.query.length > 0 ||
    Object.keys(activeListFacets(toUserListFacets(filters))).length > 0
  );
}

function UsersTable({
  loaderData,
}: {
  loaderData: InternalUsersListRouteViewProps["loaderData"];
}) {
  const { filters, users } = loaderData;
  const columns: DataTableColumn<UserListItem>[] = [
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
    <ServerDataTable
      rows={users}
      columns={columns}
      getRowKey={(savedUser) => savedUser.id}
      searchPlaceholder="Buscar por nombre o email"
      initialSearchValue={filters.query}
      facetedFilters={[
        {
          id: "rol",
          label: "Rol",
          options: roleFilterOptions,
          renderValue: (option) => (
            <Badge variant="secondary">{option.label}</Badge>
          ),
        },
        {
          id: "estado",
          label: "Estado",
          options: stateFilterOptions,
          renderValue: (option) => (
            <Badge
              variant={getStateBadgeVariant(
                option.value === "suspended" ? "suspended" : "active",
              )}
            >
              {option.label}
            </Badge>
          ),
        },
        {
          id: "archivado",
          label: "Archivo",
          options: [{ label: "Archivado", value: "si" }],
        },
      ]}
      initialFacetedFilterValues={buildInitialUserFilterValues(filters)}
      emptyMessage={emptyUserList.nothingMatched}
      currentPage={filters.page}
      totalPages={loaderData.totalPages}
      totalRows={loaderData.totalCount}
    />
  );
}

function buildInitialUserFilterValues(
  filters: UserListFilters,
): Record<string, Record<string, string>> {
  const values = activeListFacets(toUserListFacets(filters));

  return Object.keys(values).length > 0 ? { filters: values } : {};
}

function buildUserDetailHref(filters: UserListFilters, userId: string) {
  const search = buildUserListSearch(filters);

  return `/administracion/usuarios/${userId}${search.length > 0 ? `?${search}` : ""}`;
}

function getRoleLabel(role: UserListRole) {
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

function getTypeLabel(type: UserListType) {
  switch (type) {
    case "internal":
      return "Interno";
    case "academy":
      return "Usuario de academia";
  }
}

function getStateLabel(state: UserListState) {
  switch (state) {
    case "active":
      return "Activo";
    case "suspended":
      return "Suspendido";
  }
}

function getStateBadgeVariant(state: UserListState) {
  switch (state) {
    case "active":
      return "success";
    case "suspended":
      return "destructive";
  }
}

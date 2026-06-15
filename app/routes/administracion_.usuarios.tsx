import { Form, Link } from "react-router";

import { AdminShell } from "@/components/admin/shell";
import { AdminEmptyState } from "@/components/admin/resource-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { loadAdminEventContext } from "@/lib/admin/event-context.server";
import {
  listAdministrativeUsers,
  readAdministrativeUserFilters,
  type AdministrativeUserListItem,
  type AdministrativeUserListRole,
  type AdministrativeUserListState,
  type AdministrativeUserListType,
} from "@/lib/admin/users/users-list.server";
import { requireInternalUser } from "@/lib/auth/internal-access.server";

import type { Route } from "./+types/administracion_.usuarios";

type LoaderData = Awaited<ReturnType<typeof loader>>;

type AdministracionUsuariosRouteProps = {
  loaderData: LoaderData;
};

const breadcrumbItems = [{ label: "Usuarios" }];

type FilterSelectOption = {
  label: string;
  value: string;
};

const roleFilterOptions = [
  { label: "Todos", value: "all" },
  { label: "Administración", value: "admin" },
  { label: "Auditoría", value: "auditor" },
  { label: "Juzgamiento", value: "judge" },
  { label: "Academia", value: "academy" },
] satisfies FilterSelectOption[];

const stateFilterOptions = [
  { label: "Todos", value: "all" },
  { label: "Activo", value: "active" },
  { label: "Cambio obligatorio", value: "mandatory-password-change" },
  { label: "Suspendido", value: "suspended" },
] satisfies FilterSelectOption[];

const typeFilterOptions = [
  { label: "Todos", value: "all" },
  { label: "Interno", value: "internal" },
  { label: "Academia", value: "academy" },
] satisfies FilterSelectOption[];

export const meta: Route.MetaFunction = () => [
  { title: "Usuarios | Panel de administración | En Escena" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const appUser = await requireInternalUser(request, ["admin", "auditor"]);
  const eventContext = await loadAdminEventContext(request);
  const filters = readAdministrativeUserFilters(
    new URL(request.url).searchParams,
  );
  const users = await listAdministrativeUsers({ filters });

  return {
    canManage: appUser.role === "admin",
    email: appUser.email,
    eventOptions: eventContext.events,
    filters,
    selectedEventId: eventContext.selectedEventId,
    users,
  };
}

export function AdministracionUsuariosRouteView({
  loaderData,
}: AdministracionUsuariosRouteProps) {
  return (
    <AdminShell
      email={loaderData.email}
      events={loaderData.eventOptions}
      selectedEventId={loaderData.selectedEventId}
      title="Usuarios"
      showEventSelector={false}
      breadcrumbItems={breadcrumbItems}
    >
      <section className="flex flex-col gap-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-semibold">Usuarios</h2>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              Consultá accesos internos y de academia con filtros por permiso,
              tipo y estado.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-sm text-muted-foreground">
              {formatResultCount(loaderData.users.length)}
            </p>
            {loaderData.canManage ? (
              <Button asChild>
                <Link to="/administracion/usuarios/nuevo">
                  Crear Usuario interno
                </Link>
              </Button>
            ) : null}
          </div>
        </header>

        <UserFilters loaderData={loaderData} />

        {loaderData.users.length > 0 ? (
          <UsersTable loaderData={loaderData} users={loaderData.users} />
        ) : (
          <AdminEmptyState
            title="No hay Usuarios para mostrar."
            description="Probá con otra búsqueda o ajustá los filtros para revisar otros accesos."
          />
        )}
      </section>
    </AdminShell>
  );
}

export default function AdministracionUsuariosRoute({
  loaderData,
}: AdministracionUsuariosRouteProps) {
  return <AdministracionUsuariosRouteView loaderData={loaderData} />;
}

function UserFilters({ loaderData }: { loaderData: LoaderData }) {
  return (
    <Form
      method="get"
      className="grid gap-4 rounded-lg border bg-card p-4 lg:grid-cols-[minmax(0,1fr)_220px_220px_220px_auto]"
    >
      <label className="grid gap-2 text-sm font-medium text-foreground">
        Buscar
        <Input
          type="search"
          name="q"
          defaultValue={loaderData.filters.query}
          placeholder="Nombre o identificador"
        />
      </label>

      <FilterSelect
        label="Permiso principal"
        name="permiso"
        defaultValue={loaderData.filters.role}
        options={roleFilterOptions}
      />

      <FilterSelect
        label="Estado"
        name="estado"
        defaultValue={loaderData.filters.state}
        options={stateFilterOptions}
      />

      <FilterSelect
        label="Tipo"
        name="tipo"
        defaultValue={loaderData.filters.type}
        options={typeFilterOptions}
      />

      <div className="flex items-end gap-2">
        <Button type="submit" className="w-full sm:w-auto">
          Aplicar filtros
        </Button>
        <Button variant="outline" asChild>
          <Link to="/administracion/usuarios">Limpiar</Link>
        </Button>
      </div>
    </Form>
  );
}

function FilterSelect({
  defaultValue,
  label,
  name,
  options,
}: {
  defaultValue: string;
  label: string;
  name: string;
  options: Array<{ label: string; value: string }>;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium text-foreground">
      {label}
      <Select name={name} defaultValue={defaultValue}>
        <SelectTrigger className="h-10 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

function UsersTable({
  loaderData,
  users,
}: {
  loaderData: LoaderData;
  users: AdministrativeUserListItem[];
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Identificador</TableHead>
            <TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((savedUser) => (
            <TableRow key={savedUser.id}>
              <TableCell className="align-top whitespace-normal">
                <div className="flex flex-col gap-1">
                  <Link
                    to={buildUserDetailHref(loaderData, savedUser.id)}
                    className="w-fit font-medium underline-offset-4 hover:underline"
                  >
                    {savedUser.name}
                  </Link>
                  {savedUser.academyName ? (
                    <span className="text-xs text-muted-foreground">
                      {savedUser.academyName}
                    </span>
                  ) : null}
                </div>
              </TableCell>
              <TableCell className="align-top">
                <code className="rounded bg-muted px-2 py-1 text-xs font-medium">
                  {savedUser.identifier}
                </code>
              </TableCell>
              <TableCell className="align-top whitespace-normal">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">
                    {getRoleLabel(savedUser.mainRole)}
                  </Badge>
                  <Badge variant="outline">
                    {getTypeLabel(savedUser.userType)}
                  </Badge>
                  <Badge variant={getStateBadgeVariant(savedUser.state)}>
                    {getStateLabel(savedUser.state)}
                  </Badge>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function buildUserDetailHref(loaderData: LoaderData, userId: string) {
  return `/administracion/usuarios/${userId}${buildDetailSearch(loaderData)}`;
}

function buildDetailSearch(loaderData: LoaderData) {
  const searchParams = new URLSearchParams();

  if (loaderData.filters.query.length > 0) {
    searchParams.set("q", loaderData.filters.query);
  }

  if (loaderData.filters.role !== "all") {
    searchParams.set("permiso", loaderData.filters.role);
  }

  if (loaderData.filters.state !== "all") {
    searchParams.set("estado", loaderData.filters.state);
  }

  if (loaderData.filters.type !== "all") {
    searchParams.set("tipo", loaderData.filters.type);
  }

  const search = searchParams.toString();

  return search.length > 0 ? `?${search}` : "";
}

function formatResultCount(count: number) {
  return `${count} ${count === 1 ? "Usuario" : "Usuarios"}`;
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
      return "Suspendido";
  }
}

function getStateBadgeVariant(state: AdministrativeUserListState) {
  switch (state) {
    case "active":
      return "default";
    case "mandatory-password-change":
      return "secondary";
    case "suspended":
      return "destructive";
  }
}

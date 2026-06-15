import { ArrowLeft } from "lucide-react";
import { eq } from "drizzle-orm";
import type { ReactNode } from "react";
import { Link } from "react-router";

import { AdminShell } from "@/components/admin/shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/db";
import { academies, user } from "@/db/schema";
import { loadAdminEventContext } from "@/lib/admin/event-context.server";
import { requireInternalUser } from "@/lib/auth/internal-access.server";
import { cn } from "@/lib/shared/utils";

import type { Route } from "./+types/administracion_.usuarios_.$userId";

const INTERNAL_CREDENTIAL_EMAIL_DOMAIN = "usuarios-internos.enescena.local";

type LoaderData = Awaited<ReturnType<typeof loader>>;
type DetailUser = LoaderData["user"];
type DetailUserRole = "academy" | "admin" | "auditor" | "judge";
type DetailUserState = "active" | "mandatory-password-change";
type DetailUserType = "academy" | "internal";
type DetailUserRow = {
  id: string;
  name: string;
  email: string;
  role: DetailUserRole;
  internalUsername: string | null;
  requiresPasswordChange: boolean;
  academyId: string | null;
  academyName: string | null;
  academyContactName: string | null;
};

type AdministracionUsuarioDetalleRouteProps = {
  loaderData: LoaderData;
};

export const meta: Route.MetaFunction = () => [
  { title: "Usuario | Panel de administración | En Escena" },
];

export async function loader({ request, params }: Route.LoaderArgs) {
  const appUser = await requireInternalUser(request, ["admin", "auditor"]);
  const eventContext = await loadAdminEventContext(request);
  const userId = params.userId;

  if (!userId) {
    throw new Response("Usuario no encontrado.", { status: 404 });
  }

  const savedUser = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      internalUsername: user.internalUsername,
      requiresPasswordChange: user.requiresPasswordChange,
      academyId: academies.id,
      academyName: academies.name,
      academyContactName: academies.contactName,
    })
    .from(user)
    .leftJoin(academies, eq(academies.userId, user.id))
    .where(eq(user.id, userId))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!savedUser) {
    throw new Response("Usuario no encontrado.", { status: 404 });
  }

  return {
    backToList: buildBackToListHref(request.url),
    canManage: appUser.role === "admin",
    email: appUser.email,
    eventOptions: eventContext.events,
    selectedEventId: eventContext.selectedEventId,
    user: buildDetailUser(savedUser),
  };
}

export function AdministracionUsuarioDetalleRouteView({
  loaderData,
}: AdministracionUsuarioDetalleRouteProps) {
  const savedUser = loaderData.user;
  const breadcrumbItems = [
    { label: "Usuarios", to: loaderData.backToList },
    { label: savedUser.name },
  ];

  return (
    <AdminShell
      email={loaderData.email}
      events={loaderData.eventOptions}
      selectedEventId={loaderData.selectedEventId}
      title="Usuario"
      showEventSelector={false}
      breadcrumbItems={breadcrumbItems}
    >
      <section className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            to={loaderData.backToList}
            className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Volver a Usuarios
          </Link>
        </div>

        <header className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <h2 className="text-xl font-semibold">{savedUser.name}</h2>
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
          </div>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            {savedUser.userType === "academy"
              ? "Consultá la identidad de acceso de la Academia en modo solo lectura."
              : "Consultá la identidad interna en modo solo lectura."}
          </p>
        </header>

        {savedUser.userType === "academy" ? (
          <AcademyUserDetailCard user={savedUser} />
        ) : (
          <InternalUserDetailCard user={savedUser} />
        )}
      </section>
    </AdminShell>
  );
}

export default function AdministracionUsuarioDetalleRoute({
  loaderData,
}: AdministracionUsuarioDetalleRouteProps) {
  return <AdministracionUsuarioDetalleRouteView loaderData={loaderData} />;
}

function InternalUserDetailCard({ user }: { user: DetailUser }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Detalle del Usuario</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6 sm:grid-cols-2">
        <DetailItem label="Nombre" value={user.name} />
        <DetailItem label="Identificador" value={user.identifier} isCode />
        <DetailItem
          label="Correo"
          value={user.email ?? "No informado"}
          muted={user.email === null}
        />
        <DetailItem
          label="Permiso principal"
          value={getRoleLabel(user.mainRole)}
        />
        <DetailItem label="Estado" value={getStateLabel(user.state)} />
      </CardContent>
    </Card>
  );
}

function AcademyUserDetailCard({ user }: { user: DetailUser }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Detalle del Usuario</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6 sm:grid-cols-2">
        <DetailItem label="Nombre" value={user.name} />
        <DetailItem label="Correo de acceso" value={user.email ?? "-"} />
        <DetailItem label="Tipo" value="Usuario de academia" />
        <DetailItem
          label="Academia"
          value={
            user.academyId && user.academyName ? (
              <Link
                to={`/administracion/academias/${user.academyId}`}
                className="font-medium underline-offset-4 hover:underline"
              >
                {user.academyName}
              </Link>
            ) : (
              "Sin Academia vinculada"
            )
          }
          muted={!user.academyId || !user.academyName}
        />
      </CardContent>
    </Card>
  );
}

function DetailItem({
  isCode = false,
  label,
  muted = false,
  value,
}: {
  isCode?: boolean;
  label: string;
  muted?: boolean;
  value: ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <h3 className="text-sm font-medium text-muted-foreground">{label}</h3>
      {isCode && typeof value === "string" ? (
        <code className="w-fit rounded bg-muted px-2 py-1 text-sm font-medium">
          {value}
        </code>
      ) : (
        <div className={cn("text-sm", muted && "text-muted-foreground")}>
          {value}
        </div>
      )}
    </div>
  );
}

function buildDetailUser(row: DetailUserRow) {
  const isAcademyUser = row.role === "academy";

  return {
    academyId: isAcademyUser ? row.academyId : null,
    academyName: isAcademyUser ? row.academyName : null,
    email: getDetailEmail(row, isAcademyUser),
    identifier: row.internalUsername ?? row.email,
    id: row.id,
    mainRole: row.role,
    name: getDetailName(row, isAcademyUser),
    state: getDetailState(row, isAcademyUser),
    userType: getDetailUserType(isAcademyUser),
  };
}

function getDetailEmail(row: DetailUserRow, isAcademyUser: boolean) {
  if (isAcademyUser) {
    return row.email;
  }

  return getInternalOptionalEmail(row.email);
}

function getDetailName(row: DetailUserRow, isAcademyUser: boolean) {
  if (isAcademyUser) {
    return row.academyContactName ?? row.name;
  }

  return row.name;
}

function getDetailState(
  row: DetailUserRow,
  isAcademyUser: boolean,
): DetailUserState {
  if (!isAcademyUser && row.requiresPasswordChange) {
    return "mandatory-password-change";
  }

  return "active";
}

function getDetailUserType(isAcademyUser: boolean): DetailUserType {
  return isAcademyUser ? "academy" : "internal";
}

function buildBackToListHref(requestUrl: string) {
  const url = new URL(requestUrl);
  const search = url.searchParams.toString();

  return search.length > 0
    ? `/administracion/usuarios?${search}`
    : "/administracion/usuarios";
}

function getInternalOptionalEmail(email: string) {
  return email.endsWith(`@${INTERNAL_CREDENTIAL_EMAIL_DOMAIN}`) ? null : email;
}

function getRoleLabel(role: LoaderData["user"]["mainRole"]) {
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

function getTypeLabel(type: LoaderData["user"]["userType"]) {
  switch (type) {
    case "internal":
      return "Interno";
    case "academy":
      return "Usuario de academia";
  }
}

function getStateLabel(state: LoaderData["user"]["state"]) {
  switch (state) {
    case "active":
      return "Activo";
    case "mandatory-password-change":
      return "Cambio obligatorio";
  }
}

function getStateBadgeVariant(state: LoaderData["user"]["state"]) {
  switch (state) {
    case "active":
      return "default";
    case "mandatory-password-change":
      return "secondary";
  }
}

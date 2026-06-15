import { ArrowLeft } from "lucide-react";
import { eq } from "drizzle-orm";
import type { ReactNode } from "react";
import {
  Form,
  Link,
  redirect,
  useActionData,
  useSearchParams,
} from "react-router";
import { z } from "zod";

import { AdminShell } from "@/components/admin/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { db } from "@/db";
import { academies, user } from "@/db/schema";
import { loadAdminEventContext } from "@/lib/admin/event-context.server";
import { updateInternalUser } from "@/lib/admin/users/internal-user-update.server";
import {
  requireAdminUser,
  requireInternalUser,
} from "@/lib/auth/internal-access.server";
import { requireAdminPanelUser } from "@/lib/auth/internal-navigation.server";
import {
  getEmptyFieldErrors,
  getFieldErrors,
} from "@/lib/shared/form-validation";
import { cn } from "@/lib/shared/utils";

import type { Route } from "./+types/administracion_.usuarios_.$userId";

const INTERNAL_CREDENTIAL_EMAIL_DOMAIN = "usuarios-internos.enescena.local";
const userSavedSearchParam = "guardado";

const requiredTextField = (message: string) =>
  z.preprocess(
    (value) => (typeof value === "string" ? value : ""),
    z.string().trim().min(1, message),
  );

const optionalEmailField = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() : ""),
  z.union([z.literal(""), z.email("Ingresá un correo válido o dejalo vacío.")]),
);

const roleField = z.enum(["admin", "auditor", "judge"], {
  error: "Elegí un permiso principal válido.",
});

const updateInternalUserSchema = z.object({
  name: requiredTextField("Ingresá el nombre visible."),
  email: optionalEmailField,
  role: roleField,
});

const fieldNames = ["name", "email", "role"] as const;

type UpdateInternalUserField = (typeof fieldNames)[number];
type UpdateInternalUserFieldErrors = Partial<
  Record<UpdateInternalUserField, string>
>;

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
  actionData?: {
    status: "error";
    message: string;
    fieldErrors: UpdateInternalUserFieldErrors;
  };
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

  const url = new URL(request.url);

  return {
    backToList: buildBackToListHref(request.url),
    canManage: appUser.role === "admin",
    cancelHref: buildModeHref(url, userId, null),
    editHref: buildModeHref(url, userId, "editar"),
    email: appUser.email,
    eventOptions: eventContext.events,
    isEditing:
      appUser.role === "admin" && url.searchParams.get("modo") === "editar",
    selectedEventId: eventContext.selectedEventId,
    successMessage: readSavedSuccessMessage(url.searchParams),
    user: buildDetailUser(savedUser),
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const appUser = await requireAdminUser(request);
  await requireAdminPanelUser(request);
  const userId = params.userId;

  if (!userId) {
    throw new Response("Usuario no encontrado.", { status: 404 });
  }

  const formData = await request.formData();
  const parsed = updateInternalUserSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    role: formData.get("role"),
  });

  if (!parsed.success) {
    return {
      status: "error" as const,
      message: "Revisá los datos del Usuario interno.",
      fieldErrors: getFieldErrors(parsed.error, fieldNames),
    };
  }

  const result = await updateInternalUser({
    userId,
    name: parsed.data.name,
    email: parsed.data.email,
    role: parsed.data.role,
    updatedByUserId: appUser.id,
  });

  if (!result.ok) {
    return {
      status: "error" as const,
      message: result.error,
      fieldErrors: getEmptyFieldErrors<UpdateInternalUserField>(),
    };
  }

  throw redirect(buildSavedDetailHref(request.url, userId));
}

export function AdministracionUsuarioDetalleRouteView({
  actionData,
  loaderData,
}: AdministracionUsuarioDetalleRouteProps) {
  const savedUser = loaderData.user;
  const isEditing =
    loaderData.canManage &&
    savedUser.userType === "internal" &&
    (loaderData.isEditing || Boolean(actionData));
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
          {loaderData.canManage &&
          savedUser.userType === "internal" &&
          !isEditing ? (
            <Button asChild>
              <Link to={loaderData.editHref}>Editar datos</Link>
            </Button>
          ) : null}
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
              : loaderData.canManage
                ? "Actualizá los datos del Usuario interno y su Permiso principal sin modificar el Nombre de usuario interno."
                : "Consultá la identidad interna en modo solo lectura."}
          </p>
        </header>

        {loaderData.successMessage ? (
          <SuccessAlert message={loaderData.successMessage} />
        ) : null}

        {savedUser.userType === "academy" ? (
          <AcademyUserDetailCard user={savedUser} />
        ) : isEditing ? (
          <InternalUserEditCard
            actionData={actionData}
            cancelHref={loaderData.cancelHref}
            user={savedUser}
          />
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
  const actionData = useActionData<typeof action>();
  const [searchParams] = useSearchParams();

  return (
    <AdministracionUsuarioDetalleRouteView
      actionData={actionData}
      loaderData={{
        ...loaderData,
        successMessage:
          loaderData.successMessage ?? readSavedSuccessMessage(searchParams),
      }}
    />
  );
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

function InternalUserEditCard({
  actionData,
  cancelHref,
  user,
}: {
  actionData?: AdministracionUsuarioDetalleRouteProps["actionData"];
  cancelHref: string;
  user: DetailUser;
}) {
  const fieldErrors = actionData?.fieldErrors ?? {};

  return (
    <Card>
      <CardHeader>
        <CardTitle>Editar Usuario</CardTitle>
      </CardHeader>
      <CardContent>
        {actionData?.status === "error" ? (
          <p className="mb-6 text-sm text-destructive">{actionData.message}</p>
        ) : null}

        <Form method="post" className="grid gap-6">
          <FieldGroup>
            <Field data-invalid={!!fieldErrors.name} orientation="responsive">
              <FieldLabel htmlFor="name">Nombre visible</FieldLabel>
              <FieldContent>
                <Input
                  id="name"
                  name="name"
                  defaultValue={user.name}
                  autoComplete="name"
                  required
                />
                <FieldError>{fieldErrors.name}</FieldError>
              </FieldContent>
            </Field>

            <Field orientation="responsive">
              <FieldLabel htmlFor="identifier">
                Nombre de usuario interno
              </FieldLabel>
              <FieldContent>
                <Input
                  id="identifier"
                  value={user.identifier}
                  readOnly
                  disabled
                  aria-readonly="true"
                />
                <FieldDescription>
                  Se mantiene fijo después de crear el Usuario.
                </FieldDescription>
              </FieldContent>
            </Field>

            <Field data-invalid={!!fieldErrors.role} orientation="responsive">
              <FieldLabel htmlFor="role">Permiso principal</FieldLabel>
              <FieldContent>
                <Select name="role" defaultValue={user.mainRole}>
                  <SelectTrigger id="role" aria-invalid={!!fieldErrors.role}>
                    <SelectValue placeholder="Elegí un permiso" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrador</SelectItem>
                    <SelectItem value="auditor">Auditor</SelectItem>
                    <SelectItem value="judge">Juez</SelectItem>
                  </SelectContent>
                </Select>
                <FieldDescription>
                  Si cambia, el sistema cerrará las sesiones activas de este
                  Usuario.
                </FieldDescription>
                <FieldError>{fieldErrors.role}</FieldError>
              </FieldContent>
            </Field>

            <Field data-invalid={!!fieldErrors.email} orientation="responsive">
              <FieldLabel htmlFor="email">Correo</FieldLabel>
              <FieldContent>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  defaultValue={user.email ?? ""}
                  autoComplete="email"
                />
                <FieldDescription>
                  Opcional. No se usa como credencial principal.
                </FieldDescription>
                <FieldError>{fieldErrors.email}</FieldError>
              </FieldContent>
            </Field>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button type="submit">Guardar cambios</Button>
              <Button asChild variant="outline">
                <Link to={cancelHref}>Cancelar</Link>
              </Button>
            </div>
          </FieldGroup>
        </Form>
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

function buildModeHref(url: URL, userId: string, mode: "editar" | null) {
  const nextUrl = new URL(url);

  if (mode) {
    nextUrl.searchParams.set("modo", mode);
  } else {
    nextUrl.searchParams.delete("modo");
  }

  const search = nextUrl.searchParams.toString();

  return search.length > 0
    ? `/administracion/usuarios/${userId}?${search}`
    : `/administracion/usuarios/${userId}`;
}

function buildSavedDetailHref(requestUrl: string, userId: string) {
  const url = new URL(requestUrl);

  url.searchParams.delete("modo");
  url.searchParams.set(userSavedSearchParam, "1");

  const search = url.searchParams.toString();

  return search.length > 0
    ? `/administracion/usuarios/${userId}?${search}`
    : `/administracion/usuarios/${userId}`;
}

function readSavedSuccessMessage(searchParams: URLSearchParams) {
  if (searchParams.get(userSavedSearchParam) !== "1") {
    return null;
  }

  return "Guardamos los datos del Usuario interno.";
}

function getInternalOptionalEmail(email: string) {
  return email.endsWith(`@${INTERNAL_CREDENTIAL_EMAIL_DOMAIN}`) ? null : email;
}

function SuccessAlert({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-foreground">{message}</p>
      </CardContent>
    </Card>
  );
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

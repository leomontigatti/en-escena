import { ArrowLeft, CircleAlert } from "lucide-react";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { isInternalCredentialEmail } from "@/lib/admin/users/internal-user-credentials.server";
import { resetInternalUserPassword } from "@/lib/admin/users/internal-user-password-reset.server";
import { setInternalUserSuspendedState } from "@/lib/admin/users/internal-user-suspension.server";
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

const userSavedSearchParam = "guardado";
const userSavedKindSearchParam = "tipoGuardado";

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
const statusIntentSchema = z.enum(["suspend-user", "reactivate-user"]);
const resetPasswordIntent = "reset-password";
const temporaryPasswordField = z.preprocess(
  (value) => (typeof value === "string" ? value : ""),
  z
    .string()
    .trim()
    .min(1, "Ingresá una contraseña temporal.")
    .min(8, "La contraseña temporal debe tener al menos 8 caracteres."),
);
const resetPasswordSchema = z.object({
  intent: z.literal(resetPasswordIntent),
  temporaryPassword: temporaryPasswordField,
});

const fieldNames = ["name", "email", "role"] as const;
const resetPasswordFieldNames = ["temporaryPassword"] as const;

type UpdateInternalUserField = (typeof fieldNames)[number];
type UpdateInternalUserFieldErrors = Partial<
  Record<UpdateInternalUserField, string>
>;
type ResetPasswordField = (typeof resetPasswordFieldNames)[number];
type ResetPasswordFieldErrors = Partial<Record<ResetPasswordField, string>>;

type LoaderData = Awaited<ReturnType<typeof loader>>;
type DetailUser = LoaderData["user"];
type DetailUserRole = "academy" | "admin" | "auditor" | "judge";
type DetailUserState = "active" | "mandatory-password-change" | "suspended";
type DetailUserType = "academy" | "internal";
type DetailUserRow = {
  id: string;
  name: string;
  email: string;
  role: DetailUserRole;
  internalUsername: string | null;
  requiresPasswordChange: boolean;
  suspended: boolean;
  academyId: string | null;
  academyName: string | null;
  academyContactName: string | null;
};

type AdministracionUsuarioDetalleRouteProps = {
  actionData?: {
    status: "error";
    message: string;
    fieldErrors: UpdateInternalUserFieldErrors;
    resetPasswordFieldErrors: ResetPasswordFieldErrors;
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
      suspended: user.suspended,
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
    resetPasswordHref: buildModeHref(url, userId, "restablecer-contrasena"),
    email: appUser.email,
    eventOptions: eventContext.events,
    isEditing:
      appUser.role === "admin" && url.searchParams.get("modo") === "editar",
    isResettingPassword:
      appUser.role === "admin" &&
      url.searchParams.get("modo") === "restablecer-contrasena",
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
  const parsedIntent = statusIntentSchema.safeParse(formData.get("intent"));

  if (parsedIntent.success) {
    const result = await setInternalUserSuspendedState({
      action: parsedIntent.data === "suspend-user" ? "suspend" : "reactivate",
      targetUserId: userId,
      updatedByUserId: appUser.id,
    });

    if (!result.ok) {
      return {
        status: "error" as const,
        message: result.error,
        fieldErrors: getEmptyFieldErrors<UpdateInternalUserField>(),
        resetPasswordFieldErrors: getEmptyFieldErrors<ResetPasswordField>(),
      };
    }

    throw redirect(buildSavedDetailHref(request.url, userId, "status"));
  }

  const parsedResetPassword = resetPasswordSchema.safeParse({
    intent: formData.get("intent"),
    temporaryPassword: formData.get("temporaryPassword"),
  });

  if (parsedResetPassword.success) {
    const result = await resetInternalUserPassword({
      targetUserId: userId,
      temporaryPassword: parsedResetPassword.data.temporaryPassword,
      updatedByUserId: appUser.id,
    });

    if (!result.ok) {
      return {
        status: "error" as const,
        message: result.error,
        fieldErrors: getEmptyFieldErrors<UpdateInternalUserField>(),
        resetPasswordFieldErrors: getEmptyFieldErrors<ResetPasswordField>(),
      };
    }

    throw redirect(buildSavedDetailHref(request.url, userId, "password"));
  }

  if (formData.get("intent") === resetPasswordIntent) {
    const resetPasswordError = resetPasswordSchema.safeParse({
      intent: formData.get("intent"),
      temporaryPassword: formData.get("temporaryPassword"),
    });

    if (resetPasswordError.success) {
      throw new Error("Expected reset password validation to fail.");
    }

    return {
      status: "error" as const,
      message: "Revisá la contraseña temporal.",
      fieldErrors: getEmptyFieldErrors<UpdateInternalUserField>(),
      resetPasswordFieldErrors: getFieldErrors(
        resetPasswordError.error,
        resetPasswordFieldNames,
      ),
    };
  }

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
      resetPasswordFieldErrors: getEmptyFieldErrors<ResetPasswordField>(),
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
      resetPasswordFieldErrors: getEmptyFieldErrors<ResetPasswordField>(),
    };
  }

  throw redirect(buildSavedDetailHref(request.url, userId, "details"));
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
  const isResettingPassword =
    loaderData.canManage &&
    savedUser.userType === "internal" &&
    (loaderData.isResettingPassword ||
      Boolean(actionData?.resetPasswordFieldErrors.temporaryPassword));
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
          !isEditing &&
          !isResettingPassword ? (
            <div className="flex flex-wrap items-center gap-3">
              <StatusActionButton user={savedUser} />
              <Button asChild variant="outline">
                <Link to={loaderData.resetPasswordHref}>
                  Restablecer contraseña
                </Link>
              </Button>
              <Button asChild>
                <Link to={loaderData.editHref}>Editar datos</Link>
              </Button>
            </div>
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
            {getDetailDescription(savedUser.userType, loaderData.canManage)}
          </p>
        </header>

        {loaderData.successMessage ? (
          <SuccessAlert message={loaderData.successMessage} />
        ) : null}

        {savedUser.userType === "academy" ? (
          <AcademyUserDetailCard user={savedUser} />
        ) : isResettingPassword ? (
          <InternalUserResetPasswordCard
            actionData={actionData}
            cancelHref={loaderData.cancelHref}
          />
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

function InternalUserResetPasswordCard({
  actionData,
  cancelHref,
}: {
  actionData?: AdministracionUsuarioDetalleRouteProps["actionData"];
  cancelHref: string;
}) {
  const fieldErrors = actionData?.resetPasswordFieldErrors ?? {};

  return (
    <Card>
      <CardHeader>
        <CardTitle>Restablecimiento administrativo de contraseña</CardTitle>
      </CardHeader>
      <CardContent>
        {actionData?.status === "error" ? (
          <Alert variant="destructive" className="mb-6">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>No pudimos restablecer la contraseña</AlertTitle>
            <AlertDescription>{actionData.message}</AlertDescription>
          </Alert>
        ) : null}

        <Form method="post" className="grid gap-6">
          <input type="hidden" name="intent" value={resetPasswordIntent} />
          <FieldGroup>
            <Field
              data-invalid={!!fieldErrors.temporaryPassword}
              orientation="responsive"
            >
              <FieldLabel htmlFor="temporaryPassword">
                Contraseña temporal
              </FieldLabel>
              <FieldContent>
                <Input
                  id="temporaryPassword"
                  name="temporaryPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                />
                <FieldDescription>
                  Compartila por un canal seguro. El Usuario deberá cambiarla
                  antes de volver a ingresar a su área privada.
                </FieldDescription>
                <FieldError>{fieldErrors.temporaryPassword}</FieldError>
              </FieldContent>
            </Field>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button type="submit">Guardar contraseña temporal</Button>
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

function StatusActionButton({ user }: { user: DetailUser }) {
  const isSuspended = user.state === "suspended";

  return (
    <Form method="post">
      <input
        type="hidden"
        name="intent"
        value={isSuspended ? "reactivate-user" : "suspend-user"}
      />
      <Button type="submit" variant={isSuspended ? "default" : "outline"}>
        {isSuspended ? "Reactivar Usuario" : "Suspender Usuario"}
      </Button>
    </Form>
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
          <Alert variant="destructive" className="mb-6">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>No pudimos guardar el Usuario interno</AlertTitle>
            <AlertDescription>{actionData.message}</AlertDescription>
          </Alert>
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

  return isInternalCredentialEmail(row.email) ? null : row.email;
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
  if (!isAcademyUser && row.suspended) {
    return "suspended";
  }

  if (!isAcademyUser && row.requiresPasswordChange) {
    return "mandatory-password-change";
  }

  return "active";
}

function buildBackToListHref(requestUrl: string) {
  const url = new URL(requestUrl);

  return buildPathWithSearch("/administracion/usuarios", url.searchParams);
}

function buildModeHref(
  url: URL,
  userId: string,
  mode: "editar" | "restablecer-contrasena" | null,
) {
  const nextUrl = new URL(url);

  if (mode) {
    nextUrl.searchParams.set("modo", mode);
  } else {
    nextUrl.searchParams.delete("modo");
  }

  return buildUserDetailPath(userId, nextUrl.searchParams);
}

function buildSavedDetailHref(
  requestUrl: string,
  userId: string,
  kind: "details" | "password" | "status",
) {
  const url = new URL(requestUrl);

  url.searchParams.delete("modo");
  url.searchParams.set(userSavedSearchParam, "1");
  url.searchParams.set(userSavedKindSearchParam, kind);

  return buildUserDetailPath(userId, url.searchParams);
}

function readSavedSuccessMessage(searchParams: URLSearchParams) {
  if (searchParams.get(userSavedSearchParam) !== "1") {
    return null;
  }

  return searchParams.get(userSavedKindSearchParam) === "status"
    ? "Guardamos el estado del Usuario interno."
    : searchParams.get(userSavedKindSearchParam) === "password"
      ? "Guardamos la contraseña temporal del Usuario interno."
      : "Guardamos los datos del Usuario interno.";
}

function getDetailDescription(userType: DetailUserType, canManage: boolean) {
  if (userType === "academy") {
    return "Consultá la identidad de acceso de la Academia en modo solo lectura.";
  }

  if (canManage) {
    return "Actualizá los datos del Usuario interno y su Permiso principal sin modificar el Nombre de usuario interno.";
  }

  return "Consultá la identidad interna en modo solo lectura.";
}

function buildUserDetailPath(userId: string, searchParams: URLSearchParams) {
  return buildPathWithSearch(
    `/administracion/usuarios/${userId}`,
    searchParams,
  );
}

function buildPathWithSearch(pathname: string, searchParams: URLSearchParams) {
  const search = searchParams.toString();

  if (!search) {
    return pathname;
  }

  return `${pathname}?${search}`;
}

function SuccessAlert({ message }: { message: string }) {
  return (
    <Alert>
      <CircleAlert aria-hidden="true" />
      <AlertTitle>Usuario interno guardado</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
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
    case "suspended":
      return "Suspendido";
  }
}

function getStateBadgeVariant(state: LoaderData["user"]["state"]) {
  switch (state) {
    case "active":
      return "default";
    case "mandatory-password-change":
      return "secondary";
    case "suspended":
      return "outline";
  }
}

function getDetailUserType(isAcademyUser: boolean): DetailUserType {
  return isAcademyUser ? "academy" : "internal";
}

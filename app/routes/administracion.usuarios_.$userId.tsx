import { zodResolver } from "@hookform/resolvers/zod";
import { eq } from "drizzle-orm";
import { Check, Lock } from "lucide-react";
import { useEffect, useId, type ReactNode } from "react";
import {
  Controller,
  type Control,
  type SubmitHandler,
  useForm,
} from "react-hook-form";
import { Form, Link, redirect, useActionData } from "react-router";
import { z } from "zod";

import type { AdminRouteHandle } from "@/components/admin/shell";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
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
  requiredFieldMessage,
  useApplyServerFieldErrors,
} from "@/lib/shared/forms";
import {
  getEmptyFieldErrors,
  getFieldErrors,
} from "@/lib/shared/form-validation";
import {
  routeNotificationToastIds,
  type RouteNotificationKey,
} from "@/lib/shared/route-notification-toasts";
import { useServerActionToast } from "@/lib/shared/toasts";

import type { Route } from "./+types/administracion.usuarios_.$userId";

const internalUserRoles = ["admin", "auditor", "judge"] as const;
const routeNotificationSearchParam = "notificacion";
const temporaryPasswordMinLength = 8;

const requiredTextField = () => z.string().trim().min(1, requiredFieldMessage);

function isInternalUserRole(
  value: string,
): value is (typeof internalUserRoles)[number] {
  return internalUserRoles.includes(
    value as (typeof internalUserRoles)[number],
  );
}

const optionalEmailField = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || z.email().safeParse(value).success,
    "Ingresá un correo válido o dejalo vacío.",
  );

const roleField = z
  .string()
  .trim()
  .min(1, requiredFieldMessage)
  .refine(isInternalUserRole, "Elegí un permiso principal válido.");

const updateInternalUserSchema = z.object({
  name: requiredTextField(),
  email: optionalEmailField,
  role: roleField,
});

const statusIntentSchema = z.enum(["suspend-user", "reactivate-user"]);
const resetPasswordIntent = "reset-password";
const resetPasswordSchema = z.object({
  temporaryPassword: requiredTextField().refine(
    (value) => value.length >= temporaryPasswordMinLength,
    "La contraseña temporal debe tener al menos 8 caracteres.",
  ),
});

const fieldNames = ["name", "email", "role"] as const;
const resetPasswordFieldNames = ["temporaryPassword"] as const;

type UpdateInternalUserField = (typeof fieldNames)[number];
type UpdateInternalUserFieldErrors = Partial<
  Record<UpdateInternalUserField, string>
>;
type ResetPasswordField = (typeof resetPasswordFieldNames)[number];
type ResetPasswordFieldErrors = Partial<Record<ResetPasswordField, string>>;
type UpdateInternalUserFormValues = {
  name: string;
  email: string;
  role: string;
};
type ResetPasswordFormValues = {
  temporaryPassword: string;
};
type UpdateInternalUserControl = Control<UpdateInternalUserFormValues>;
type ResetPasswordControl = Control<ResetPasswordFormValues>;

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

type DetailActionData = {
  form: "edit" | "reset-password" | "status";
  status: "error";
  message: string;
  fieldErrors: UpdateInternalUserFieldErrors;
  resetPasswordFieldErrors: ResetPasswordFieldErrors;
  editValues: UpdateInternalUserFormValues;
  resetPasswordValues: ResetPasswordFormValues;
};

type AdministracionUsuarioDetalleRouteProps = {
  actionData?: DetailActionData;
  loaderData: LoaderData;
};

const emptyEditValues: UpdateInternalUserFormValues = {
  name: "",
  email: "",
  role: "judge",
};

const emptyResetPasswordValues: ResetPasswordFormValues = {
  temporaryPassword: "",
};
const emptyUpdateInternalUserFieldErrors =
  getEmptyFieldErrors<UpdateInternalUserField>();
const emptyResetPasswordFieldErrors = getEmptyFieldErrors<ResetPasswordField>();

export const meta: Route.MetaFunction = () => [
  { title: "Usuario | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [
    { label: "Usuarios", to: "/administracion/usuarios" },
    (match) => {
      const data = match.data as LoaderData | undefined;
      return data ? { label: data.user.name } : null;
    },
  ],
  adminShell: { showEventSelector: false },
} satisfies AdminRouteHandle;

export async function loader({ request, params }: Route.LoaderArgs) {
  const appUser = await requireInternalUser(request, ["admin", "auditor"]);
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
    isEditing:
      appUser.role === "admin" && url.searchParams.get("modo") === "editar",
    isResettingPassword:
      appUser.role === "admin" &&
      url.searchParams.get("modo") === "restablecer-contrasena",
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
  const intent = formData.get("intent");
  const parsedIntent = statusIntentSchema.safeParse(intent);

  if (parsedIntent.success) {
    const result = await setInternalUserSuspendedState({
      action: parsedIntent.data === "suspend-user" ? "suspend" : "reactivate",
      targetUserId: userId,
      updatedByUserId: appUser.id,
    });

    if (!result.ok) {
      return buildDetailActionError({
        form: "status",
        message: result.error,
      });
    }

    throw redirect(
      buildNotificationDetailHref(
        request.url,
        userId,
        parsedIntent.data === "suspend-user"
          ? "usuario-interno-suspendido"
          : "usuario-interno-reactivado",
      ),
    );
  }

  if (intent === resetPasswordIntent) {
    const values = readResetPasswordFormValues(formData);
    const parsedResetPassword = resetPasswordSchema.safeParse(values);

    if (!parsedResetPassword.success) {
      return buildDetailActionError({
        form: "reset-password",
        message: "Revisá la contraseña temporal.",
        resetPasswordFieldErrors: getFieldErrors(
          parsedResetPassword.error,
          resetPasswordFieldNames,
        ),
        resetPasswordValues: values,
      });
    }

    const result = await resetInternalUserPassword({
      targetUserId: userId,
      temporaryPassword: parsedResetPassword.data.temporaryPassword,
      updatedByUserId: appUser.id,
    });

    if (!result.ok) {
      return buildDetailActionError({
        form: "reset-password",
        message: result.error,
      });
    }

    throw redirect(
      buildNotificationDetailHref(
        request.url,
        userId,
        "usuario-interno-restablecido",
      ),
    );
  }

  const values = readUpdateInternalUserFormValues(formData);
  const parsed = updateInternalUserSchema.safeParse(values);

  if (!parsed.success) {
    return buildDetailActionError({
      form: "edit",
      message: "Revisá los datos del Usuario interno.",
      fieldErrors: getFieldErrors(parsed.error, fieldNames),
      editValues: values,
    });
  }

  const result = await updateInternalUser({
    userId,
    name: parsed.data.name,
    email: parsed.data.email,
    role: parsed.data.role,
    updatedByUserId: appUser.id,
  });

  if (!result.ok) {
    return buildDetailActionError({
      form: "edit",
      message: result.error,
      fieldErrors: getUpdateInternalUserServerFieldErrors(result.error),
      editValues: values,
    });
  }

  throw redirect(
    buildNotificationDetailHref(
      request.url,
      userId,
      "usuario-interno-actualizado",
    ),
  );
}

export function AdministracionUsuarioDetalleRouteView({
  actionData,
  loaderData,
}: AdministracionUsuarioDetalleRouteProps) {
  const savedUser = loaderData.user;
  const canManageInternalUser =
    loaderData.canManage && savedUser.userType === "internal";
  const isResettingPassword =
    canManageInternalUser &&
    (loaderData.isResettingPassword || actionData?.form === "reset-password");

  useServerActionToast(actionData, {
    toastId: routeNotificationToastIds["user-form-error"],
  });

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold">Editar usuario</h2>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            {getDetailDescription(savedUser.userType, loaderData.canManage)}
          </p>
        </div>
        {canManageInternalUser ? (
          <UserActionsMenu
            resetPasswordHref={loaderData.resetPasswordHref}
            user={savedUser}
          />
        ) : null}
      </header>

      {savedUser.userType === "academy" ? (
        <AcademyUserFormCard
          backToList={loaderData.backToList}
          user={savedUser}
        />
      ) : isResettingPassword ? (
        <InternalUserResetPasswordCard
          actionData={actionData}
          cancelHref={loaderData.cancelHref}
        />
      ) : canManageInternalUser ? (
        <InternalUserEditCard
          actionData={actionData}
          cancelHref={loaderData.backToList}
          user={savedUser}
        />
      ) : (
        <InternalUserDetailCard user={savedUser} />
      )}
    </section>
  );
}

function InternalUserResetPasswordCard({
  actionData,
  cancelHref,
}: {
  actionData?: DetailActionData;
  cancelHref: string;
}) {
  const formValues =
    actionData?.resetPasswordValues ?? emptyResetPasswordValues;
  const form = useForm<
    ResetPasswordFormValues,
    unknown,
    ResetPasswordFormValues
  >({
    defaultValues: formValues,
    mode: "onSubmit",
    resolver: zodResolver(resetPasswordSchema),
  });

  useEffect(() => {
    form.reset(formValues);
  }, [form, formValues.temporaryPassword]);

  useApplyServerFieldErrors(
    form,
    actionData?.form === "reset-password"
      ? actionData.resetPasswordFieldErrors
      : emptyResetPasswordFieldErrors,
  );

  function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const formElement = event.currentTarget;
    const submitNativeForm: SubmitHandler<ResetPasswordFormValues> = () => {
      formElement.submit();
    };

    void form.handleSubmit(submitNativeForm)(event);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Restablecimiento administrativo de contraseña</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          method="post"
          noValidate
          className="grid gap-6"
          onSubmit={handleSubmit}
        >
          <input type="hidden" name="intent" value={resetPasswordIntent} />
          <FieldGroup>
            <InternalUserResetPasswordField control={form.control} />

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button type="submit">Guardar contraseña temporal</Button>
              <Button asChild variant="outline">
                <Link to={cancelHref}>Cancelar</Link>
              </Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

export default function AdministracionUsuarioDetalleRoute({
  loaderData,
}: AdministracionUsuarioDetalleRouteProps) {
  const actionData = useActionData<typeof action>();

  return (
    <AdministracionUsuarioDetalleRouteView
      actionData={actionData}
      loaderData={loaderData}
    />
  );
}

function InternalUserDetailCard({ user }: { user: DetailUser }) {
  return (
    <UserFormCard>
      <LockedUserField label="Nombre" value={user.name} />
      <LockedUserField
        label="Nombre de usuario interno"
        value={user.identifier}
      />
      <LockedUserField label="Correo" value={user.email ?? ""} />
      <LockedUserField
        label="Permiso principal"
        value={getRoleLabel(user.mainRole)}
      />
      <LockedUserField label="Estado" value={getStateLabel(user.state)} />
    </UserFormCard>
  );
}

function UserActionsMenu({
  resetPasswordHref,
  user,
}: {
  resetPasswordHref: string;
  user: DetailUser;
}) {
  return (
    <ResourceActionsMenu contentClassName="w-56">
      <DropdownMenuGroup>
        <DropdownMenuItem asChild>
          <Link to={resetPasswordHref}>Restablecer contraseña</Link>
        </DropdownMenuItem>
        <StatusActionItem user={user} />
      </DropdownMenuGroup>
    </ResourceActionsMenu>
  );
}

function StatusActionItem({ user }: { user: DetailUser }) {
  const isSuspended = user.state === "suspended";

  return (
    <Form method="post">
      <input
        type="hidden"
        name="intent"
        value={isSuspended ? "reactivate-user" : "suspend-user"}
      />
      <DropdownMenuItem
        asChild
        variant={isSuspended ? undefined : "destructive"}
      >
        <button
          type="submit"
          className="w-full justify-start whitespace-nowrap"
        >
          {isSuspended ? "Reactivar usuario" : "Suspender usuario"}
        </button>
      </DropdownMenuItem>
    </Form>
  );
}

function InternalUserEditCard({
  actionData,
  cancelHref,
  user,
}: {
  actionData?: DetailActionData;
  cancelHref: string;
  user: DetailUser;
}) {
  const formValues =
    actionData?.editValues ?? buildUpdateInternalUserFormValues(user);
  const form = useForm<
    UpdateInternalUserFormValues,
    unknown,
    UpdateInternalUserFormValues
  >({
    defaultValues: formValues,
    mode: "onSubmit",
    resolver: zodResolver(updateInternalUserSchema),
  });

  useEffect(() => {
    form.reset(formValues);
  }, [form, formValues.email, formValues.name, formValues.role]);

  useApplyServerFieldErrors(
    form,
    actionData?.form === "edit"
      ? actionData.fieldErrors
      : emptyUpdateInternalUserFieldErrors,
  );

  function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const formElement = event.currentTarget;
    const submitNativeForm: SubmitHandler<
      UpdateInternalUserFormValues
    > = () => {
      formElement.submit();
    };

    void form.handleSubmit(submitNativeForm)(event);
  }

  return (
    <form method="post" noValidate onSubmit={handleSubmit}>
      <UserFormCard
        footer={
          <>
            <Button asChild variant="outline" size="lg">
              <Link to={cancelHref}>Volver</Link>
            </Button>
            <Button type="submit" size="lg">
              <Check aria-hidden="true" data-icon="inline-start" />
              Guardar
            </Button>
          </>
        }
      >
        <InternalUserEditTextField
          autoComplete="name"
          control={form.control}
          label="Nombre"
          name="name"
        />
        <LockedUserField
          label="Nombre de usuario interno"
          value={user.identifier}
        />
        <InternalUserEditTextField
          autoComplete="email"
          control={form.control}
          label="Correo"
          name="email"
          type="email"
        />
        <InternalUserEditRoleField control={form.control} />
      </UserFormCard>
    </form>
  );
}

function InternalUserEditTextField({
  autoComplete,
  control,
  description,
  label,
  name,
  type = "text",
}: {
  autoComplete?: string;
  control: UpdateInternalUserControl;
  description?: string;
  label: string;
  name: UpdateInternalUserField;
  type?: React.InputHTMLAttributes<HTMLInputElement>["type"];
}) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <Controller<UpdateInternalUserFormValues, UpdateInternalUserField>
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.error ? true : undefined}>
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          <Input
            id={id}
            aria-describedby={fieldState.error ? errorId : undefined}
            aria-invalid={fieldState.error ? true : undefined}
            autoComplete={autoComplete}
            type={type}
            {...field}
            value={field.value ?? ""}
          />
          {description ? (
            <FieldDescription>{description}</FieldDescription>
          ) : null}
          <FieldError id={errorId}>{fieldState.error?.message}</FieldError>
        </Field>
      )}
    />
  );
}

function InternalUserEditRoleField({
  control,
}: {
  control: UpdateInternalUserControl;
}) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <Controller<UpdateInternalUserFormValues, "role">
      control={control}
      name="role"
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.error ? true : undefined}>
          <FieldLabel htmlFor={id}>Permiso principal</FieldLabel>
          <Select
            name={field.name}
            value={field.value}
            onValueChange={field.onChange}
          >
            <SelectTrigger
              id={id}
              aria-describedby={fieldState.error ? errorId : undefined}
              aria-invalid={fieldState.error ? true : undefined}
            >
              <SelectValue placeholder="Elegí un permiso" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Administrador</SelectItem>
              <SelectItem value="auditor">Auditor</SelectItem>
              <SelectItem value="judge">Juez</SelectItem>
            </SelectContent>
          </Select>
          <FieldError id={errorId}>{fieldState.error?.message}</FieldError>
        </Field>
      )}
    />
  );
}

function InternalUserResetPasswordField({
  control,
}: {
  control: ResetPasswordControl;
}) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <Controller<ResetPasswordFormValues, "temporaryPassword">
      control={control}
      name="temporaryPassword"
      render={({ field, fieldState }) => (
        <Field
          data-invalid={fieldState.error ? true : undefined}
          orientation="responsive"
        >
          <FieldLabel htmlFor={id}>Contraseña temporal</FieldLabel>
          <FieldContent>
            <Input
              id={id}
              aria-describedby={fieldState.error ? errorId : undefined}
              aria-invalid={fieldState.error ? true : undefined}
              autoComplete="new-password"
              type="password"
              {...field}
              value={field.value ?? ""}
            />
            <FieldDescription>
              Compartila por un canal seguro. El Usuario deberá cambiarla antes
              de volver a ingresar a su área privada.
            </FieldDescription>
            <FieldError id={errorId}>{fieldState.error?.message}</FieldError>
          </FieldContent>
        </Field>
      )}
    />
  );
}

function AcademyUserFormCard({
  backToList,
  user,
}: {
  backToList: string;
  user: DetailUser;
}) {
  return (
    <UserFormCard
      footer={
        <Button asChild variant="outline" size="lg">
          <Link to={backToList}>Volver</Link>
        </Button>
      }
    >
      <LockedUserField label="Nombre" value={user.name} />
      <LockedUserField label="Correo de acceso" value={user.email ?? ""} />
      <LockedUserField label="Tipo" value="Usuario de academia" />
      <LockedUserField label="Academia" value={user.academyName ?? ""} />
    </UserFormCard>
  );
}

function UserFormCard({
  children,
  footer,
}: {
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Card>
      <CardContent>
        <FieldGroup className="grid gap-5 md:grid-cols-2">
          {children}
        </FieldGroup>
      </CardContent>
      {footer ? (
        <CardFooter className="justify-end gap-3 border-0 bg-transparent pt-0">
          {footer}
        </CardFooter>
      ) : null}
    </Card>
  );
}

function LockedUserField({ label, value }: { label: string; value: string }) {
  const id = useId();

  return (
    <Field data-disabled>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="relative">
        <Input id={id} value={value} disabled readOnly className="pr-9" />
        <Lock
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-3 size-3 -translate-y-1/2 text-muted-foreground"
        />
      </div>
    </Field>
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
  const searchParams = sanitizeUserDetailSearchParams(url.searchParams);

  return buildPathWithSearch("/administracion/usuarios", searchParams);
}

function buildModeHref(
  url: URL,
  userId: string,
  mode: "editar" | "restablecer-contrasena" | null,
) {
  const nextSearchParams = sanitizeUserDetailSearchParams(url.searchParams);

  if (mode) {
    nextSearchParams.set("modo", mode);
  } else {
    nextSearchParams.delete("modo");
  }

  return buildUserDetailPath(userId, nextSearchParams);
}

type UserRouteNotification = Extract<
  RouteNotificationKey,
  | "usuario-interno-actualizado"
  | "usuario-interno-reactivado"
  | "usuario-interno-restablecido"
  | "usuario-interno-suspendido"
>;

function buildNotificationDetailHref(
  requestUrl: string,
  userId: string,
  notification: UserRouteNotification,
) {
  const url = new URL(requestUrl);
  const searchParams = sanitizeUserDetailSearchParams(url.searchParams);

  searchParams.set(routeNotificationSearchParam, notification);

  return buildUserDetailPath(userId, searchParams);
}

function sanitizeUserDetailSearchParams(searchParams: URLSearchParams) {
  const nextSearchParams = new URLSearchParams(searchParams);

  nextSearchParams.delete("modo");
  nextSearchParams.delete(routeNotificationSearchParam);
  nextSearchParams.delete("guardado");
  nextSearchParams.delete("tipoGuardado");

  return nextSearchParams;
}

function getDetailDescription(userType: DetailUserType, canManage: boolean) {
  if (userType === "academy") {
    return "Consultá la identidad de acceso de la Academia en modo solo lectura.";
  }

  if (canManage) {
    return "Actualizá los datos del usuario interno y sus permisos.";
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

function readUpdateInternalUserFormValues(
  formData: FormData,
): UpdateInternalUserFormValues {
  return {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    role: String(formData.get("role") ?? ""),
  };
}

function readResetPasswordFormValues(
  formData: FormData,
): ResetPasswordFormValues {
  return {
    temporaryPassword: String(formData.get("temporaryPassword") ?? ""),
  };
}

function buildUpdateInternalUserFormValues(
  user: DetailUser,
): UpdateInternalUserFormValues {
  return {
    name: user.name,
    email: user.email ?? "",
    role: user.mainRole === "academy" ? "judge" : user.mainRole,
  };
}

function buildDetailActionError({
  editValues = emptyEditValues,
  fieldErrors = emptyUpdateInternalUserFieldErrors,
  form,
  message,
  resetPasswordFieldErrors = emptyResetPasswordFieldErrors,
  resetPasswordValues = emptyResetPasswordValues,
}: {
  editValues?: UpdateInternalUserFormValues;
  fieldErrors?: UpdateInternalUserFieldErrors;
  form: DetailActionData["form"];
  message: string;
  resetPasswordFieldErrors?: ResetPasswordFieldErrors;
  resetPasswordValues?: ResetPasswordFormValues;
}): DetailActionData {
  return {
    form,
    status: "error",
    message,
    fieldErrors,
    resetPasswordFieldErrors,
    editValues,
    resetPasswordValues,
  };
}

function getUpdateInternalUserServerFieldErrors(
  error: string,
): UpdateInternalUserFieldErrors {
  if (error === "Ese correo ya tiene un usuario en En Escena.") {
    return { email: error };
  }

  return getEmptyFieldErrors<UpdateInternalUserField>();
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

function getDetailUserType(isAcademyUser: boolean): DetailUserType {
  return isAcademyUser ? "academy" : "internal";
}

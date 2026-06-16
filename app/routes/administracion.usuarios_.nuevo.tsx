import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlert } from "lucide-react";
import { useEffect, useId } from "react";
import {
  Controller,
  type Control,
  type SubmitHandler,
  useForm,
} from "react-hook-form";
import { Link, redirect, useActionData } from "react-router";
import { z } from "zod";

import type { AdminRouteHandle } from "@/components/admin/shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
import { createInternalUser } from "@/lib/admin/users/internal-user-create.server";
import { requireAdminPanelUser } from "@/lib/auth/internal-navigation.server";
import {
  requiredFieldMessage,
  useApplyServerFieldErrors,
} from "@/lib/shared/forms";
import {
  getEmptyFieldErrors,
  getFieldErrors,
} from "@/lib/shared/form-validation";
import { routeNotificationToastIds } from "@/lib/shared/route-notification-toasts";
import { useServerActionToast } from "@/lib/shared/toasts";

import type { Route } from "./+types/administracion.usuarios_.nuevo";

const internalUserRoles = ["admin", "auditor", "judge"] as const;

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

const createInternalUserSchema = z.object({
  name: requiredTextField(),
  internalUsername: requiredTextField(),
  role: roleField,
  temporaryPassword: requiredTextField().refine(
    (value) => value.length >= 8,
    "La contraseña temporal debe tener al menos 8 caracteres.",
  ),
  email: optionalEmailField,
});

const fieldNames = [
  "name",
  "internalUsername",
  "role",
  "temporaryPassword",
  "email",
] as const;

type CreateInternalUserField = (typeof fieldNames)[number];
type CreateInternalUserFieldErrors = Partial<
  Record<CreateInternalUserField, string>
>;
type CreateInternalUserFormValues = {
  name: string;
  internalUsername: string;
  role: string;
  temporaryPassword: string;
  email: string;
};
type CreateInternalUserControl = Control<CreateInternalUserFormValues>;

type AdministracionUsuariosNuevoRouteProps = {
  actionData?: {
    form: "create";
    status: "error";
    message: string;
    fieldErrors: CreateInternalUserFieldErrors;
    values: CreateInternalUserFormValues;
  };
  loaderData: Record<string, never>;
};

const defaultCreateInternalUserFormValues: CreateInternalUserFormValues = {
  name: "",
  internalUsername: "",
  role: "judge",
  temporaryPassword: "",
  email: "",
};
const emptyCreateInternalUserFieldErrors =
  getEmptyFieldErrors<CreateInternalUserField>();

export const meta: Route.MetaFunction = () => [
  { title: "Crear Usuario interno | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [
    { label: "Usuarios", to: "/administracion/usuarios" },
    { label: "Crear Usuario interno" },
  ],
  adminShell: { showEventSelector: false },
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdminPanelUser(request);
  return {};
}

export async function action({ request }: Route.ActionArgs) {
  const appUser = await requireAdminPanelUser(request);
  const formData = await request.formData();
  const values = readCreateInternalUserFormValues(formData);
  const parsed = createInternalUserSchema.safeParse(values);

  if (!parsed.success) {
    return {
      form: "create" as const,
      status: "error" as const,
      message: "Revisá los datos del Usuario interno.",
      fieldErrors: getFieldErrors(parsed.error, fieldNames),
      values,
    };
  }

  const result = await createInternalUser({
    name: parsed.data.name,
    internalUsername: parsed.data.internalUsername,
    role: parsed.data.role,
    temporaryPassword: parsed.data.temporaryPassword,
    email: parsed.data.email,
    createdByUserId: appUser.id,
  });

  if (!result.ok) {
    return {
      form: "create" as const,
      status: "error" as const,
      message: result.error,
      fieldErrors: getCreateInternalUserServerFieldErrors(result.error),
      values: {
        ...values,
        temporaryPassword: "",
      },
    };
  }

  throw redirect(
    "/administracion/usuarios/nuevo?notificacion=usuario-interno-creado",
  );
}

export function AdministracionUsuariosNuevoRouteView({
  actionData,
  loaderData,
}: AdministracionUsuariosNuevoRouteProps) {
  const formValues = actionData?.values ?? defaultCreateInternalUserFormValues;
  const form = useForm<
    CreateInternalUserFormValues,
    unknown,
    CreateInternalUserFormValues
  >({
    defaultValues: formValues,
    mode: "onSubmit",
    resolver: zodResolver(createInternalUserSchema),
  });

  useEffect(() => {
    form.reset(formValues);
  }, [
    form,
    formValues.email,
    formValues.internalUsername,
    formValues.name,
    formValues.role,
    formValues.temporaryPassword,
  ]);

  useApplyServerFieldErrors(
    form,
    actionData?.fieldErrors ?? emptyCreateInternalUserFieldErrors,
  );

  useServerActionToast(actionData, {
    toastId: routeNotificationToastIds["user-form-error"],
  });

  function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const formElement = event.currentTarget;
    const submitNativeForm: SubmitHandler<
      CreateInternalUserFormValues
    > = () => {
      formElement.submit();
    };

    void form.handleSubmit(submitNativeForm)(event);
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <section className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Crear Usuario interno</h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          Creá accesos internos con nombre de usuario propio y cambio
          obligatorio de contraseña en el primer ingreso.
        </p>
      </section>

      <Alert>
        <CircleAlert aria-hidden="true" />
        <AlertTitle>
          Compartí la contraseña temporal por un canal seguro
        </AlertTitle>
        <AlertDescription>
          La contraseña temporal no vuelve a mostrarse después de guardar y no
          se registra en auditoría.
        </AlertDescription>
      </Alert>

      <form
        method="post"
        noValidate
        className="rounded-lg border bg-card p-6 shadow-sm"
        onSubmit={handleSubmit}
      >
        <FieldGroup>
          <CreateInternalUserTextField
            autoComplete="name"
            control={form.control}
            label="Nombre visible"
            name="name"
          />

          <CreateInternalUserTextField
            autoComplete="username"
            control={form.control}
            description="Usá solo letras minúsculas, números, punto, guion o guion bajo."
            label="Nombre de usuario interno"
            name="internalUsername"
            spellCheck={false}
          />

          <CreateInternalUserRoleField control={form.control} />

          <CreateInternalUserTextField
            autoComplete="new-password"
            control={form.control}
            description="Debe tener al menos 8 caracteres."
            label="Contraseña temporal"
            name="temporaryPassword"
            type="password"
          />

          <CreateInternalUserTextField
            autoComplete="email"
            control={form.control}
            description="Opcional. No se verifica ni se usa para ingresar."
            label="Correo"
            name="email"
            type="email"
          />

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button type="submit">Crear Usuario interno</Button>
            <Button asChild variant="outline">
              <Link to="/administracion">Volver al panel</Link>
            </Button>
          </div>
        </FieldGroup>
      </form>
    </div>
  );
}

function CreateInternalUserTextField({
  autoComplete,
  control,
  description,
  label,
  name,
  spellCheck,
  type = "text",
}: {
  autoComplete?: string;
  control: CreateInternalUserControl;
  description?: string;
  label: string;
  name: CreateInternalUserField;
  spellCheck?: boolean;
  type?: React.InputHTMLAttributes<HTMLInputElement>["type"];
}) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <Controller<CreateInternalUserFormValues, CreateInternalUserField>
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field
          data-invalid={fieldState.error ? true : undefined}
          orientation="responsive"
        >
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          <FieldContent>
            <Input
              id={id}
              aria-describedby={fieldState.error ? errorId : undefined}
              aria-invalid={fieldState.error ? true : undefined}
              autoComplete={autoComplete}
              spellCheck={spellCheck}
              type={type}
              {...field}
              value={field.value ?? ""}
            />
            {description ? (
              <FieldDescription>{description}</FieldDescription>
            ) : null}
            <FieldError id={errorId}>{fieldState.error?.message}</FieldError>
          </FieldContent>
        </Field>
      )}
    />
  );
}

function CreateInternalUserRoleField({
  control,
}: {
  control: CreateInternalUserControl;
}) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <Controller<CreateInternalUserFormValues, "role">
      control={control}
      name="role"
      render={({ field, fieldState }) => (
        <Field
          data-invalid={fieldState.error ? true : undefined}
          orientation="responsive"
        >
          <FieldLabel htmlFor={id}>Permiso principal</FieldLabel>
          <FieldContent>
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
          </FieldContent>
        </Field>
      )}
    />
  );
}

function readCreateInternalUserFormValues(
  formData: FormData,
): CreateInternalUserFormValues {
  return {
    name: String(formData.get("name") ?? ""),
    internalUsername: String(formData.get("internalUsername") ?? ""),
    role: String(formData.get("role") ?? ""),
    temporaryPassword: String(formData.get("temporaryPassword") ?? ""),
    email: String(formData.get("email") ?? ""),
  };
}

function getCreateInternalUserServerFieldErrors(
  error: string,
): CreateInternalUserFieldErrors {
  if (
    error === "Ese nombre de usuario interno ya existe." ||
    error === "Ingresá un nombre de usuario interno válido."
  ) {
    return { internalUsername: error };
  }

  if (error === "Ese correo ya tiene un usuario en En Escena.") {
    return { email: error };
  }

  return getEmptyFieldErrors<CreateInternalUserField>();
}

export default function AdministracionUsuariosNuevoRoute({
  loaderData,
}: AdministracionUsuariosNuevoRouteProps) {
  const actionData = useActionData<typeof action>();

  return (
    <AdministracionUsuariosNuevoRouteView
      actionData={actionData}
      loaderData={loaderData}
    />
  );
}

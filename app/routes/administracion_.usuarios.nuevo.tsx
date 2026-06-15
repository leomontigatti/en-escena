import { CircleAlert } from "lucide-react";
import {
  Form,
  Link,
  redirect,
  useActionData,
  useSearchParams,
} from "react-router";
import { z } from "zod";

import { AdminShell } from "@/components/admin/shell";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  loadAdminEventContext,
  type AdminEventContext,
} from "@/lib/admin/event-context.server";
import { createInternalUser } from "@/lib/admin/users/internal-user-create.server";
import { requireAdminPanelUser } from "@/lib/auth/internal-navigation.server";
import {
  getEmptyFieldErrors,
  getFieldErrors,
} from "@/lib/shared/form-validation";

import type { Route } from "./+types/administracion_.usuarios.nuevo";

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

const createInternalUserSchema = z.object({
  name: requiredTextField("Ingresá el nombre visible."),
  internalUsername: requiredTextField("Ingresá el nombre de usuario interno."),
  role: roleField,
  temporaryPassword: requiredTextField(
    "Ingresá la contraseña temporal.",
  ).refine(
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

type AdministracionUsuariosNuevoRouteProps = {
  actionData?: {
    status: "error";
    message: string;
    fieldErrors: CreateInternalUserFieldErrors;
  };
  loaderData: {
    email: string;
    eventOptions: AdminEventContext["events"];
    selectedEventId: AdminEventContext["selectedEventId"];
  };
  wasCreated?: boolean;
};

export const meta: Route.MetaFunction = () => [
  { title: "Crear Usuario interno | Panel de administración | En Escena" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const appUser = await requireAdminPanelUser(request);
  const eventContext = await loadAdminEventContext(request);

  return {
    email: appUser.email,
    eventOptions: eventContext.events,
    selectedEventId: eventContext.selectedEventId,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const appUser = await requireAdminPanelUser(request);
  const formData = await request.formData();
  const parsed = createInternalUserSchema.safeParse({
    name: formData.get("name"),
    internalUsername: formData.get("internalUsername"),
    role: formData.get("role"),
    temporaryPassword: formData.get("temporaryPassword"),
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return {
      status: "error" as const,
      message: "Revisá los datos del Usuario interno.",
      fieldErrors: getFieldErrors(parsed.error, fieldNames),
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
      status: "error" as const,
      message: result.error,
      fieldErrors: getEmptyFieldErrors<CreateInternalUserField>(),
    };
  }

  throw redirect("/administracion/usuarios/nuevo?estado=creado");
}

export function AdministracionUsuariosNuevoRouteView({
  actionData,
  loaderData,
  wasCreated = false,
}: AdministracionUsuariosNuevoRouteProps) {
  const fieldErrors = actionData?.fieldErrors ?? {};

  return (
    <AdminShell
      email={loaderData.email}
      events={loaderData.eventOptions}
      selectedEventId={loaderData.selectedEventId}
      title="Crear Usuario interno"
      showEventSelector={false}
      breadcrumbItems={[
        { label: "Usuarios" },
        { label: "Crear Usuario interno" },
      ]}
    >
      <div className="flex max-w-3xl flex-col gap-6">
        <section className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold">Crear Usuario interno</h2>
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

        {wasCreated ? (
          <Alert>
            <CircleAlert aria-hidden="true" />
            <AlertTitle>Usuario interno creado</AlertTitle>
            <AlertDescription>
              Compartí la contraseña temporal por un canal seguro. La persona
              deberá cambiarla al ingresar por primera vez.
            </AlertDescription>
          </Alert>
        ) : null}

        {actionData?.status === "error" ? (
          <Alert variant="destructive">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>No pudimos crear el Usuario interno</AlertTitle>
            <AlertDescription>{actionData.message}</AlertDescription>
          </Alert>
        ) : null}

        <Form method="post" className="rounded-lg border bg-card p-6 shadow-sm">
          <FieldGroup>
            <Field data-invalid={!!fieldErrors.name} orientation="responsive">
              <FieldLabel htmlFor="name">Nombre visible</FieldLabel>
              <FieldContent>
                <Input id="name" name="name" autoComplete="name" required />
                <FieldError>{fieldErrors.name}</FieldError>
              </FieldContent>
            </Field>

            <Field
              data-invalid={!!fieldErrors.internalUsername}
              orientation="responsive"
            >
              <FieldLabel htmlFor="internalUsername">
                Nombre de usuario interno
              </FieldLabel>
              <FieldContent>
                <Input
                  id="internalUsername"
                  name="internalUsername"
                  autoComplete="username"
                  required
                  spellCheck={false}
                />
                <FieldDescription>
                  Usá solo letras minúsculas, números, punto, guion o guion
                  bajo.
                </FieldDescription>
                <FieldError>{fieldErrors.internalUsername}</FieldError>
              </FieldContent>
            </Field>

            <Field data-invalid={!!fieldErrors.role} orientation="responsive">
              <FieldLabel htmlFor="role">Permiso principal</FieldLabel>
              <FieldContent>
                <Select name="role" defaultValue="judge">
                  <SelectTrigger id="role" aria-invalid={!!fieldErrors.role}>
                    <SelectValue placeholder="Elegí un permiso" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrador</SelectItem>
                    <SelectItem value="auditor">Auditor</SelectItem>
                    <SelectItem value="judge">Juez</SelectItem>
                  </SelectContent>
                </Select>
                <FieldError>{fieldErrors.role}</FieldError>
              </FieldContent>
            </Field>

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
                  Debe tener al menos 8 caracteres.
                </FieldDescription>
                <FieldError>{fieldErrors.temporaryPassword}</FieldError>
              </FieldContent>
            </Field>

            <Field data-invalid={!!fieldErrors.email} orientation="responsive">
              <FieldLabel htmlFor="email">Correo</FieldLabel>
              <FieldContent>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                />
                <FieldDescription>
                  Opcional. No se verifica ni se usa para ingresar.
                </FieldDescription>
                <FieldError>{fieldErrors.email}</FieldError>
              </FieldContent>
            </Field>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button type="submit">Crear Usuario interno</Button>
              <Button asChild variant="outline">
                <Link to="/administracion">Volver al panel</Link>
              </Button>
            </div>
          </FieldGroup>
        </Form>
      </div>
    </AdminShell>
  );
}

export default function AdministracionUsuariosNuevoRoute({
  loaderData,
}: AdministracionUsuariosNuevoRouteProps) {
  const actionData = useActionData<typeof action>();
  const [searchParams] = useSearchParams();

  return (
    <AdministracionUsuariosNuevoRouteView
      actionData={actionData}
      loaderData={loaderData}
      wasCreated={searchParams.get("estado") === "creado"}
    />
  );
}

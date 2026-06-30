import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, TriangleAlert } from "lucide-react";
import { useEffect, useId } from "react";
import { Controller, type Control, useForm } from "react-hook-form";
import { Link, useNavigation, useSubmit } from "react-router";

import {
  AdminResourceFormCard,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
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
import {
  createValidatedRouteSubmitHandler,
  isRouteFormPending,
  useApplyServerFieldErrors,
} from "@/lib/shared/forms";
import { routeNotificationToastIds } from "@/lib/shared/route-notification-toasts";
import { useServerActionToast } from "@/lib/shared/toasts";

import {
  createInternalUserIntent,
  createInternalUserSchema,
  defaultCreateInternalUserFormValues,
  emptyCreateInternalUserFieldErrors,
  type CreateInternalUserActionData,
  type CreateInternalUserField,
  type CreateInternalUserFormValues,
} from "./shared";

type CreateInternalUserControl = Control<CreateInternalUserFormValues>;

export type AdministracionUsuariosNuevoRouteViewProps = {
  actionData?: CreateInternalUserActionData;
};

export function AdministracionUsuariosNuevoRouteView({
  actionData,
}: AdministracionUsuariosNuevoRouteViewProps) {
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

  const submit = useSubmit();
  const navigation = useNavigation();
  const isCreatingUser = isRouteFormPending(navigation, {
    intent: createInternalUserIntent,
  });
  const handleSubmit = createValidatedRouteSubmitHandler(form, submit);

  return (
    <AdminResourceLayout
      title="Nuevo usuario"
      description="Creá accesos internos con nombre de usuario propio y cambio obligatorio de contraseña en el primer ingreso."
      requireSelectedEvent={false}
    >
      <div className="flex w-full flex-col gap-6">
        <Alert variant="warning">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>
            Compartí la contraseña temporal por un canal seguro
          </AlertTitle>
          <AlertDescription>
            La contraseña temporal no vuelve a mostrarse después de guardar y no
            se registra en auditoría.
          </AlertDescription>
        </Alert>

        <form method="post" noValidate onSubmit={handleSubmit}>
          <input type="hidden" name="intent" value={createInternalUserIntent} />
          <AdminResourceFormCard
            footer={
              <>
                <Button asChild variant="outline">
                  <Link to="/administracion">Volver al panel</Link>
                </Button>
                <Button type="submit" disabled={isCreatingUser}>
                  {isCreatingUser ? (
                    <LoaderCircle
                      aria-hidden="true"
                      className="animate-spin"
                      data-icon
                    />
                  ) : null}
                  Nuevo usuario
                </Button>
              </>
            }
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
            </FieldGroup>
          </AdminResourceFormCard>
        </form>
      </div>
    </AdminResourceLayout>
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

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, TriangleAlert } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigation, useSubmit } from "react-router";

import {
  AdminResourceFormCard,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { AlertStack } from "@/components/shared/alert-stack";
import { SelectField } from "@/components/shared/select-field";
import { TextInputField } from "@/components/shared/text-input-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import {
  createValidatedRouteSubmitHandler,
  isRouteFormPending,
} from "@/lib/shared/forms";
import { routeNotificationToastIds } from "@/lib/shared/route-notification-toasts";
import { useServerActionToast } from "@/lib/shared/toasts";

import {
  createInternalUserIntent,
  createInternalUserSchema,
  defaultCreateInternalUserFormValues,
  type CreateInternalUserActionData,
  type CreateInternalUserFormValues,
} from "./shared";

const createInternalUserRoleOptions = [
  { value: "admin", label: "Administrador" },
  { value: "auditor", label: "Auditor" },
  { value: "judge", label: "Juez" },
];

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
        <AlertStack>
          <Alert variant="warning">
            <TriangleAlert aria-hidden="true" />
            <AlertTitle>
              Compartí la contraseña temporal por un canal seguro
            </AlertTitle>
            <AlertDescription>
              La contraseña temporal no vuelve a mostrarse después de guardar y
              no se registra en auditoría.
            </AlertDescription>
          </Alert>
        </AlertStack>

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
              <TextInputField
                autoComplete="name"
                control={form.control}
                label="Nombre visible"
                name="name"
                orientation="responsive"
              />

              <TextInputField
                autoComplete="username"
                control={form.control}
                description="Usá solo letras minúsculas, números, punto, guion o guion bajo."
                label="Nombre de usuario interno"
                name="internalUsername"
                orientation="responsive"
                spellCheck={false}
              />

              <SelectField
                control={form.control}
                label="Permiso principal"
                name="role"
                options={createInternalUserRoleOptions}
                orientation="responsive"
                placeholder="Elegí un permiso"
              />

              <TextInputField
                autoComplete="new-password"
                control={form.control}
                description="Debe tener al menos 8 caracteres."
                label="Contraseña temporal"
                name="temporaryPassword"
                orientation="responsive"
                type="password"
              />

              <TextInputField
                autoComplete="email"
                control={form.control}
                description="Opcional. No se verifica ni se usa para ingresar."
                label="Correo"
                name="email"
                orientation="responsive"
                type="email"
              />
            </FieldGroup>
          </AdminResourceFormCard>
        </form>
      </div>
    </AdminResourceLayout>
  );
}

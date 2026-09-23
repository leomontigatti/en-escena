import { zodResolver } from "@hookform/resolvers/zod";
import { TriangleAlert } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";

import { AdminResourceLayout } from "@/components/admin/resource-layout";
import { BackButton, SubmitButton } from "@/components/shared/action-buttons";
import { AlertStack } from "@/components/shared/alert-stack";
import { SelectField } from "@/components/shared/select-field";
import { TextInputField } from "@/components/shared/text-input-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { UserFormCard } from "@/lib/admin/users/user-detail-cards";
import {
  createValidatedRouteFormDataSubmitHandler,
  isRouteFormPending,
  useOptionalNavigation,
  useOptionalSubmit,
} from "@/lib/shared/forms";
import { notificationToastIds } from "@/lib/shared/notification-toasts";
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

export type NewInternalUserRouteViewProps = {
  actionData?: CreateInternalUserActionData;
};

export function NewInternalUserRouteView({
  actionData,
}: NewInternalUserRouteViewProps) {
  const formValues = actionData?.values ?? defaultCreateInternalUserFormValues;
  const form = useForm<
    CreateInternalUserFormValues,
    unknown,
    CreateInternalUserFormValues
  >({
    defaultValues: formValues,
    resolver: zodResolver(createInternalUserSchema),
  });
  const { control, reset } = form;

  useEffect(() => {
    reset(formValues);
  }, [
    reset,
    formValues.email,
    formValues.internalUsername,
    formValues.name,
    formValues.role,
    formValues.temporaryPassword,
  ]);

  useServerActionToast(actionData, {
    toastId: notificationToastIds["user-form-error"],
  });

  const submit = useOptionalSubmit();
  const navigation = useOptionalNavigation();
  const isCreatingUser = isRouteFormPending(navigation, {
    intent: createInternalUserIntent,
  });
  const handleSubmit = createValidatedRouteFormDataSubmitHandler(form, submit);

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
              La contraseña temporal no vuelve a mostrarse después de guardar.
            </AlertDescription>
          </Alert>
        </AlertStack>

        <form method="post" noValidate onSubmit={handleSubmit}>
          <input type="hidden" name="intent" value={createInternalUserIntent} />
          <UserFormCard
            footer={
              <>
                <BackButton to="/administracion/usuarios" />
                <SubmitButton isPending={isCreatingUser} />
              </>
            }
          >
            <TextInputField
              autoComplete="name"
              control={control}
              label="Nombre"
              name="name"
            />

            <TextInputField
              autoComplete="username"
              control={control}
              label="Nombre de usuario interno"
              name="internalUsername"
              placeholder="Solo minúsculas, números, puntos, guion o guion bajo"
              spellCheck={false}
            />

            <TextInputField
              autoComplete="email"
              control={control}
              label="Correo"
              name="email"
              placeholder="Opcional"
              type="email"
            />

            <SelectField
              control={control}
              label="Permiso principal"
              name="role"
              options={createInternalUserRoleOptions}
              placeholder="Elegí un permiso"
            />

            <TextInputField
              autoComplete="new-password"
              control={control}
              label="Contraseña temporal"
              name="temporaryPassword"
              placeholder="Mínimo 8 caracteres"
              type="password"
            />
          </UserFormCard>
        </form>
      </div>
    </AdminResourceLayout>
  );
}

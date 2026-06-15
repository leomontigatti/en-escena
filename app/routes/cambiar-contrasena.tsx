import { Form, redirect, useActionData } from "react-router";
import { z } from "zod";

import { AccessHeader, AccessPage } from "@/components/auth/access-ui";
import { AccessTextField, useAccessForm } from "@/components/auth/access-form";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import {
  completeMandatoryPasswordChange,
  requireMandatoryPasswordChangeUser,
} from "@/lib/auth/mandatory-password-change.server";
import {
  authToastIds,
  passwordField,
  passwordMismatchMessage,
  requiredTextField,
} from "@/lib/auth/access-form.shared";
import {
  getEmptyFieldErrors,
  getFieldErrors,
} from "@/lib/shared/form-validation";
import { useServerActionToast } from "@/lib/shared/toasts";

import type { Route } from "./+types/cambiar-contrasena";

const changePasswordSchema = z
  .object({
    currentPassword: requiredTextField(),
    newPassword: passwordField(),
    confirmPassword: requiredTextField(),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: passwordMismatchMessage,
    path: ["confirmPassword"],
  });
const changePasswordFields = [
  "currentPassword",
  "newPassword",
  "confirmPassword",
] as const;
type ChangePasswordField = (typeof changePasswordFields)[number];
type ChangePasswordValues = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

const emptyChangePasswordValues: ChangePasswordValues = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};

export const meta: Route.MetaFunction = () => [
  { title: "Cambio obligatorio de contraseña | En Escena" },
];

export async function loader({ request }: Route.LoaderArgs) {
  await requireMandatoryPasswordChangeUser(request);

  return null;
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const values = emptyChangePasswordValues;
  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return {
      status: "error" as const,
      message: "Revisá los campos marcados.",
      fieldErrors: getFieldErrors(parsed.error, changePasswordFields),
      values,
    };
  }

  const result = await completeMandatoryPasswordChange({
    request,
    currentPassword: parsed.data.currentPassword,
    newPassword: parsed.data.newPassword,
  });

  if (!result.ok) {
    return {
      status: "error" as const,
      message: result.error,
      fieldErrors: getEmptyFieldErrors<ChangePasswordField>(),
      values,
    };
  }

  throw redirect(result.redirectTo);
}

export default function CambiarContrasenaRoute() {
  const actionData = useActionData<typeof action>();
  const form = useAccessForm({
    schema: changePasswordSchema,
    values: actionData?.values ?? emptyChangePasswordValues,
    fieldErrors: actionData?.fieldErrors,
  });

  useServerActionToast(actionData, {
    toastId: authToastIds.mandatoryPasswordChangeError,
  });

  return (
    <AccessPage>
      <AccessHeader
        eyebrow="Cambio obligatorio"
        title="Definí una nueva contraseña"
        description="Antes de entrar a tu área privada, reemplazá la contraseña temporal por una propia."
      />

      <Form
        method="post"
        noValidate
        className="mt-8"
        onSubmit={form.handleSubmit}
      >
        <FieldGroup>
          <AccessTextField
            controller={form}
            autoComplete="current-password"
            label="Contraseña actual"
            name="currentPassword"
            type="password"
          />

          <AccessTextField
            controller={form}
            autoComplete="new-password"
            description="Usá al menos 8 caracteres."
            label="Nueva contraseña"
            name="newPassword"
            type="password"
          />

          <AccessTextField
            controller={form}
            autoComplete="new-password"
            label="Confirmar contraseña"
            name="confirmPassword"
            type="password"
          />

          <Button className="w-full" type="submit">
            Guardar contraseña
          </Button>
        </FieldGroup>
      </Form>
    </AccessPage>
  );
}

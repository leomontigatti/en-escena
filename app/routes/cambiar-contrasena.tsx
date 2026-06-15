import { Form, redirect, useActionData } from "react-router";
import { z } from "zod";

import {
  AccessField,
  AccessHeader,
  AccessNotice,
  AccessPage,
  accessButtonClassName,
} from "@/components/auth/access-ui";
import {
  completeMandatoryPasswordChange,
  requireMandatoryPasswordChangeUser,
} from "@/lib/auth/mandatory-password-change.server";
import {
  getEmptyFieldErrors,
  getFieldErrors,
} from "@/lib/shared/form-validation";

import type { Route } from "./+types/cambiar-contrasena";

const requiredTextField = (message: string) =>
  z.preprocess(
    (value) => (typeof value === "string" ? value : ""),
    z.string().min(1, message),
  );

const passwordField = (message: string) =>
  z.preprocess(
    (value) => (typeof value === "string" ? value : ""),
    z.string().min(8, message),
  );

const changePasswordSchema = z
  .object({
    currentPassword: requiredTextField("Ingresá tu contraseña actual."),
    newPassword: passwordField(
      "La contraseña debe tener al menos 8 caracteres.",
    ),
    confirmPassword: requiredTextField("Confirmá tu nueva contraseña."),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: "Las contraseñas no coinciden.",
    path: ["confirmPassword"],
  });
const changePasswordFields = [
  "currentPassword",
  "newPassword",
  "confirmPassword",
] as const;
type ChangePasswordField = (typeof changePasswordFields)[number];

export const meta: Route.MetaFunction = () => [
  { title: "Cambio obligatorio de contraseña | En Escena" },
];

export async function loader({ request }: Route.LoaderArgs) {
  await requireMandatoryPasswordChangeUser(request);

  return null;
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
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
    };
  }

  throw redirect(result.redirectTo);
}

export default function CambiarContrasenaRoute() {
  const actionData = useActionData<typeof action>();

  return (
    <AccessPage>
      <AccessHeader
        eyebrow="Cambio obligatorio"
        title="Definí una nueva contraseña"
        description="Antes de entrar a tu área privada, reemplazá la contraseña temporal por una propia."
      />

      <Form method="post" className="mt-8 space-y-5">
        <AccessField
          id="currentPassword"
          label="Contraseña actual"
          error={actionData?.fieldErrors.currentPassword}
          inputProps={{
            name: "currentPassword",
            type: "password",
            required: true,
            autoComplete: "current-password",
          }}
        />

        <AccessField
          id="newPassword"
          label="Nueva contraseña"
          hint="Usá al menos 8 caracteres."
          error={actionData?.fieldErrors.newPassword}
          inputProps={{
            name: "newPassword",
            type: "password",
            required: true,
            minLength: 8,
            autoComplete: "new-password",
          }}
        />

        <AccessField
          id="confirmPassword"
          label="Confirmar contraseña"
          error={actionData?.fieldErrors.confirmPassword}
          inputProps={{
            name: "confirmPassword",
            type: "password",
            required: true,
            minLength: 8,
            autoComplete: "new-password",
          }}
        />

        {actionData ? (
          <AccessNotice variant="error">{actionData.message}</AccessNotice>
        ) : null}

        <button type="submit" className={accessButtonClassName}>
          Guardar contraseña
        </button>
      </Form>
    </AccessPage>
  );
}

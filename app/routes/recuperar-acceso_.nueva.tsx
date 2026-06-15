import { Form, redirect, useActionData, useLoaderData } from "react-router";
import { z } from "zod";

import {
  AccessHeader,
  AccessPage,
  AccessSecondaryLink,
} from "@/components/auth/access-ui";
import { AccessTextField, useAccessForm } from "@/components/auth/access-form";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { resetAccessPassword } from "@/lib/auth/access-recovery.server";
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

import type { Route } from "./+types/recuperar-acceso_.nueva";

const resetPasswordSchema = z
  .object({
    token: z.string().min(1),
    password: passwordField(),
    confirmPassword: requiredTextField(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: passwordMismatchMessage,
    path: ["confirmPassword"],
  });
const resetPasswordFields = ["password", "confirmPassword"] as const;
type ResetPasswordField = (typeof resetPasswordFields)[number];
type ResetPasswordValues = {
  password: string;
  confirmPassword: string;
};

const emptyResetPasswordValues: ResetPasswordValues = {
  password: "",
  confirmPassword: "",
};

export const meta: Route.MetaFunction = () => [
  { title: "Nueva contraseña | En Escena" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const error = url.searchParams.get("error");

  if (error || !token) {
    return { tokenStatus: "invalid" as const, token: null };
  }

  return { tokenStatus: "valid" as const, token };
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const values = emptyResetPasswordValues;
  const parsed = resetPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return {
      status: "error" as const,
      message: "Revisá los campos marcados.",
      fieldErrors: getFieldErrors(parsed.error, resetPasswordFields),
      values,
    };
  }

  const result = await resetAccessPassword({
    token: parsed.data.token,
    newPassword: parsed.data.password,
    request,
  });

  if (!result.ok) {
    return {
      status: "error" as const,
      message: result.error,
      fieldErrors: getEmptyFieldErrors<ResetPasswordField>(),
      values,
    };
  }

  throw redirect("/ingresar?recuperacion=ok");
}

export default function NuevaContrasenaRoute() {
  const { tokenStatus, token } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const form = useAccessForm({
    schema: resetPasswordSchema.omit({ token: true }),
    values: actionData?.values ?? emptyResetPasswordValues,
    fieldErrors: actionData?.fieldErrors,
  });

  useServerActionToast(actionData, {
    toastId: authToastIds.resetPasswordError,
  });

  if (tokenStatus === "invalid") {
    return (
      <AccessPage>
        <AccessHeader
          eyebrow="Enlace inválido"
          title="No pudimos recuperar tu acceso"
          tone="danger"
          description="El enlace ya fue usado o expiró. Pedí uno nuevo para definir otra contraseña."
        />
        <AccessSecondaryLink to="/recuperar-acceso" className="mt-8 w-full">
          Pedir nuevo enlace
        </AccessSecondaryLink>
      </AccessPage>
    );
  }

  return (
    <AccessPage>
      <AccessHeader
        eyebrow="Recuperación habilitada"
        title="Definí una nueva contraseña"
        description="La recuperación solo cambia tus credenciales. Tus permisos y datos de academia no se modifican."
      />

      <Form
        method="post"
        noValidate
        className="mt-8"
        onSubmit={form.handleSubmit}
      >
        <input type="hidden" name="token" value={token ?? ""} />
        <FieldGroup>
          <AccessTextField
            controller={form}
            autoComplete="new-password"
            description="Usá al menos 8 caracteres."
            label="Nueva contraseña"
            name="password"
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

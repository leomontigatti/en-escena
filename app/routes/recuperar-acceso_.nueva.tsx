import { Form, redirect, useActionData, useLoaderData } from "react-router";
import { z } from "zod";

import {
  AccessField,
  AccessHeader,
  AccessNotice,
  AccessPage,
  AccessSecondaryLink,
  accessButtonClassName,
} from "@/components/access-ui";
import { resetAccessPassword } from "@/lib/access-recovery.server";
import { getEmptyFieldErrors, getFieldErrors } from "@/lib/form-validation";

import type { Route } from "./+types/recuperar-acceso_.nueva";

const resetPasswordSchema = z
  .object({
    token: z.string().min(1),
    password: z
      .string()
      .min(8, "La contraseña debe tener al menos 8 caracteres."),
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Las contraseñas no coinciden.",
    path: ["confirmPassword"],
  });
const resetPasswordFields = ["password", "confirmPassword"] as const;
type ResetPasswordField = (typeof resetPasswordFields)[number];

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
    };
  }

  throw redirect("/ingresar?recuperacion=ok");
}

export default function NuevaContrasenaRoute() {
  const { tokenStatus, token } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

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

      <Form method="post" className="mt-8 space-y-5">
        <input type="hidden" name="token" value={token ?? ""} />

        <AccessField
          id="password"
          label="Nueva contraseña"
          hint="Usá al menos 8 caracteres."
          error={actionData?.fieldErrors.password}
          inputProps={{
            name: "password",
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

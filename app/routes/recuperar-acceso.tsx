import { Form, useActionData } from "react-router";
import { z } from "zod";

import {
  AccessField,
  AccessHeader,
  AccessNotice,
  AccessPage,
  AccessTextLink,
  accessButtonClassName,
} from "@/components/auth/access-ui";
import { requestAccessRecoveryEmail } from "@/lib/auth/access-recovery.server";
import {
  getEmptyFieldErrors,
  getFieldErrors,
} from "@/lib/shared/form-validation";
import { redirectSignedInUserFromPublicRoute } from "@/lib/auth/internal-navigation.server";

import type { Route } from "./+types/recuperar-acceso";

const requestRecoverySchema = z.object({
  email: z.email("Ingresá un correo electrónico válido."),
});
const recoveryFields = ["email"] as const;
type RecoveryField = (typeof recoveryFields)[number];

export const meta: Route.MetaFunction = () => [
  { title: "Recuperar acceso | En Escena" },
];

export async function loader({ request }: Route.LoaderArgs) {
  await redirectSignedInUserFromPublicRoute(request);

  return null;
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const parsed = requestRecoverySchema.safeParse({
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return {
      status: "error" as const,
      message: "Revisá los campos marcados.",
      fieldErrors: getFieldErrors(parsed.error, recoveryFields),
    };
  }

  const result = await requestAccessRecoveryEmail({
    email: parsed.data.email,
    requestUrl: request.url,
  });

  return {
    status: "success" as const,
    message: result.message,
    fieldErrors: getEmptyFieldErrors<RecoveryField>(),
  };
}

export default function RecuperarAccesoRoute() {
  const actionData = useActionData<typeof action>();

  return (
    <AccessPage>
      <AccessHeader
        eyebrow="En Escena"
        title="Recuperar acceso"
        description="Ingresá el correo de tu usuario. Si corresponde a una cuenta existente, te enviaremos un enlace para definir una nueva contraseña."
      />

      <Form method="post" className="mt-8 space-y-5">
        <AccessField
          id="email"
          label="Correo"
          error={actionData?.fieldErrors.email}
          inputProps={{
            name: "email",
            type: "email",
            required: true,
            autoComplete: "email",
            inputMode: "email",
            spellCheck: false,
          }}
        />

        {actionData ? (
          <AccessNotice variant={actionData.status}>
            {actionData.message}
          </AccessNotice>
        ) : null}

        <button type="submit" className={accessButtonClassName}>
          Enviar enlace
        </button>
      </Form>

      <p className="mt-6 text-center text-sm text-slate-600">
        ¿Recordaste tu contraseña?{" "}
        <AccessTextLink to="/ingresar">Ingresar</AccessTextLink>
      </p>
    </AccessPage>
  );
}

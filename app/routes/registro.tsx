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
import { requestAcademyRegistrationEmail } from "@/lib/academies/registration.server";
import {
  getEmptyFieldErrors,
  getFieldErrors,
} from "@/lib/shared/form-validation";
import { redirectSignedInUserFromPublicRoute } from "@/lib/auth/internal-navigation.server";

import type { Route } from "./+types/registro";

const requestRegistrationSchema = z.object({
  email: z.email("Ingresá un correo electrónico válido."),
});
const registrationFields = ["email"] as const;
type RegistrationField = (typeof registrationFields)[number];

export const meta: Route.MetaFunction = () => [
  { title: "Registro de academia | En Escena" },
];

export async function loader({ request }: Route.LoaderArgs) {
  await redirectSignedInUserFromPublicRoute(request);

  return null;
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const parsed = requestRegistrationSchema.safeParse({
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return {
      status: "error" as const,
      message: "Revisá los campos marcados.",
      fieldErrors: getFieldErrors(parsed.error, registrationFields),
    };
  }

  await requestAcademyRegistrationEmail({
    email: parsed.data.email,
    requestUrl: request.url,
  });

  return {
    status: "success" as const,
    message:
      "Si el correo puede registrarse, enviamos un enlace para completar el alta.",
    fieldErrors: getEmptyFieldErrors<RegistrationField>(),
  };
}

export default function RegistroRoute() {
  const actionData = useActionData<typeof action>();

  return (
    <AccessPage>
      <AccessHeader
        eyebrow="Portal de academias"
        title="Registrá tu academia"
        description="Ingresá tu correo. Te vamos a enviar un enlace de uso único para completar los datos de la academia."
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
        ¿Ya tenés usuario?{" "}
        <AccessTextLink to="/ingresar">Ingresar</AccessTextLink>
      </p>
    </AccessPage>
  );
}

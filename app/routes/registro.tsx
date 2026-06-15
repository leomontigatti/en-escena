import { Form, useActionData } from "react-router";
import { z } from "zod";

import {
  AccessHeader,
  AccessPage,
  AccessTextLink,
} from "@/components/auth/access-ui";
import { AccessTextField, useAccessForm } from "@/components/auth/access-form";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { requestAcademyRegistrationEmail } from "@/lib/academies/registration.server";
import {
  authToastIds,
  emailField,
  readFormValue,
} from "@/lib/auth/access-form.shared";
import { redirectSignedInUserFromPublicRoute } from "@/lib/auth/internal-navigation.server";
import {
  getEmptyFieldErrors,
  getFieldErrors,
} from "@/lib/shared/form-validation";
import { useServerActionToast } from "@/lib/shared/toasts";

import type { Route } from "./+types/registro";

const requestRegistrationSchema = z.object({
  email: emailField(),
});
const registrationFields = ["email"] as const;
type RegistrationField = (typeof registrationFields)[number];
type RegistrationValues = {
  email: string;
};

const emptyRegistrationValues: RegistrationValues = {
  email: "",
};

export const meta: Route.MetaFunction = () => [
  { title: "Registro de academia | En Escena" },
];

export async function loader({ request }: Route.LoaderArgs) {
  await redirectSignedInUserFromPublicRoute(request);

  return null;
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const values = {
    email: readFormValue(formData.get("email")),
  } satisfies RegistrationValues;
  const parsed = requestRegistrationSchema.safeParse({
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return {
      status: "error" as const,
      message: "Revisá los campos marcados.",
      fieldErrors: getFieldErrors(parsed.error, registrationFields),
      values,
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
    values,
  };
}

export default function RegistroRoute() {
  const actionData = useActionData<typeof action>();
  const form = useAccessForm({
    schema: requestRegistrationSchema,
    values: actionData?.values ?? emptyRegistrationValues,
    fieldErrors: actionData?.fieldErrors,
  });

  useServerActionToast(actionData, {
    toastId: getRegistrationToastId(actionData?.status),
  });

  return (
    <AccessPage>
      <AccessHeader
        eyebrow="Portal de academias"
        title="Registrá tu academia"
        description="Ingresá tu correo. Te vamos a enviar un enlace de uso único para completar los datos de la academia."
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
            autoComplete="email"
            inputMode="email"
            label="Correo"
            name="email"
            spellCheck={false}
            type="email"
          />

          <Button className="w-full" type="submit">
            Enviar enlace
          </Button>
        </FieldGroup>
      </Form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        ¿Ya tenés usuario?{" "}
        <AccessTextLink to="/ingresar">Ingresar</AccessTextLink>
      </p>
    </AccessPage>
  );
}

function getRegistrationToastId(status: "success" | "error" | undefined) {
  if (status === "success") {
    return authToastIds.registrationResult;
  }

  return authToastIds.registrationError;
}

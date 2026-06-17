import { data, Form, useActionData } from "react-router";
import { z } from "zod";

import {
  AccessHeader,
  AccessPage,
  AccessTextLink,
} from "@/components/auth/access-ui";
import { AccessTextField, useAccessForm } from "@/components/auth/access-form";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { requestAccessRecoveryEmail } from "@/lib/auth/access-recovery.server";
import {
  authToastIds,
  emailField,
  readFormValue,
} from "@/lib/auth/access-form.shared";
import {
  getEmptyFieldErrors,
  getFieldErrors,
} from "@/lib/shared/form-validation";
import { redirectSignedInUserFromPublicRoute } from "@/lib/auth/internal-navigation.server";
import { useServerActionToast } from "@/lib/shared/toasts";

import type { Route } from "./+types/recuperar-acceso";

const requestRecoverySchema = z.object({
  email: emailField(),
});
const recoveryFields = ["email"] as const;
type RecoveryField = (typeof recoveryFields)[number];
type RecoveryValues = {
  email: string;
};

const emptyRecoveryValues: RecoveryValues = {
  email: "",
};

export const meta: Route.MetaFunction = () => [
  { title: "Recuperar acceso | En Escena" },
];

export async function loader({ request }: Route.LoaderArgs) {
  await redirectSignedInUserFromPublicRoute(request);

  return null;
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const values = {
    email: readFormValue(formData.get("email")),
  } satisfies RecoveryValues;
  const parsed = requestRecoverySchema.safeParse({
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return {
      status: "error" as const,
      message: "Revisá los campos marcados.",
      fieldErrors: getFieldErrors(parsed.error, recoveryFields),
      values,
    };
  }

  const result = await requestAccessRecoveryEmail({
    email: parsed.data.email,
    requestUrl: request.url,
    request,
  });

  return data(
    {
      status: "success" as const,
      message: result.message,
      fieldErrors: getEmptyFieldErrors<RecoveryField>(),
      values,
    },
    {
      headers: result.headers,
    },
  );
}

export default function RecuperarAccesoRoute() {
  const actionData = useActionData<typeof action>();
  const form = useAccessForm({
    schema: requestRecoverySchema,
    values: actionData?.values ?? emptyRecoveryValues,
    fieldErrors: actionData?.fieldErrors,
  });

  useServerActionToast(actionData, {
    toastId: getRecoveryToastId(actionData?.status),
  });

  return (
    <AccessPage>
      <AccessHeader
        eyebrow="En Escena"
        title="Recuperar acceso"
        description="Ingresá el correo de tu usuario. Si corresponde a una cuenta existente, te enviaremos un enlace para definir una nueva contraseña."
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
        ¿Recordaste tu contraseña?{" "}
        <AccessTextLink to="/ingresar">Ingresar</AccessTextLink>
      </p>
    </AccessPage>
  );
}

function getRecoveryToastId(status: "success" | "error" | undefined) {
  if (status === "success") {
    return authToastIds.recoveryResult;
  }

  return authToastIds.recoveryError;
}

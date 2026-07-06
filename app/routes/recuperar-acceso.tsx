import { LoaderCircle } from "lucide-react";
import { Form, useActionData, useNavigation } from "react-router";
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
import { authToastIds, emailField } from "@/lib/auth/access-form.shared";
import {
  buildPublicAccessFormSuccess,
  getPublicAccessResultToastId,
  isPublicAccessFormSubmitting,
  parsePublicAccessForm,
} from "@/lib/auth/public-access-route.shared";
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

export { publicAccessRouteLoader as loader } from "@/lib/auth/public-access-route.server";

export async function action({ request }: Route.ActionArgs) {
  const formResult = await parsePublicAccessForm({
    request,
    schema: requestRecoverySchema,
    fieldNames: recoveryFields,
  });

  if (!formResult.ok) {
    return formResult.response;
  }

  const result = await requestAccessRecoveryEmail({
    email: formResult.data.email,
    requestUrl: request.url,
    request,
  });

  return buildPublicAccessFormSuccess<RecoveryField, RecoveryValues>({
    message: result.message,
    values: formResult.values,
    headers: result.headers,
  });
}

export default function RecuperarAccesoRoute() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = isPublicAccessFormSubmitting(navigation);
  const form = useAccessForm({
    schema: requestRecoverySchema,
    values: actionData?.values ?? emptyRecoveryValues,
  });

  useServerActionToast(actionData, {
    toastId: getPublicAccessResultToastId({
      status: actionData?.status,
      successToastId: authToastIds.recoveryResult,
      errorToastId: authToastIds.recoveryError,
    }),
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

          <Button className="w-full" type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <LoaderCircle
                aria-hidden="true"
                className="animate-spin"
                data-icon
              />
            ) : null}
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

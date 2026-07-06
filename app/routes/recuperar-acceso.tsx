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
import {
  authToastIds,
  emailField,
  readFormValue,
} from "@/lib/auth/access-form.shared";
import {
  buildPublicAccessFormError,
  buildPublicAccessFormSuccess,
  loadPublicAccessRoute,
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

export async function loader({ request }: Route.LoaderArgs) {
  return await loadPublicAccessRoute(request);
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
    return buildPublicAccessFormError({
      error: parsed.error,
      fieldNames: recoveryFields,
      values,
    });
  }

  const result = await requestAccessRecoveryEmail({
    email: parsed.data.email,
    requestUrl: request.url,
    request,
  });

  return buildPublicAccessFormSuccess<RecoveryField, RecoveryValues>({
    message: result.message,
    values,
    headers: result.headers,
  });
}

export default function RecuperarAccesoRoute() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting =
    navigation.state !== "idle" &&
    navigation.formMethod?.toLowerCase() === "post";
  const form = useAccessForm({
    schema: requestRecoverySchema,
    values: actionData?.values ?? emptyRecoveryValues,
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

function getRecoveryToastId(status: "success" | "error" | undefined) {
  if (status === "success") {
    return authToastIds.recoveryResult;
  }

  return authToastIds.recoveryError;
}

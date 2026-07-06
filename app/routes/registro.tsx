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
import { startAcademyRegistration } from "@/lib/academies/registration.server";
import {
  authToastIds,
  emailField,
  passwordField,
  passwordMismatchMessage,
  requiredTextField,
} from "@/lib/auth/access-form.shared";
import {
  buildPublicAccessFormSuccess,
  getPublicAccessResultToastId,
  isPublicAccessFormSubmitting,
  parsePublicAccessForm,
} from "@/lib/auth/public-access-route.shared";
import { useServerActionToast } from "@/lib/shared/toasts";

import type { Route } from "./+types/registro";

const requestRegistrationSchema = z
  .object({
    email: emailField(),
    password: passwordField(),
    confirmPassword: requiredTextField(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: passwordMismatchMessage,
    path: ["confirmPassword"],
  });
const registrationFields = ["email", "password", "confirmPassword"] as const;
type RegistrationField = (typeof registrationFields)[number];
type RegistrationValues = {
  email: string;
  password: string;
  confirmPassword: string;
};

const emptyRegistrationValues: RegistrationValues = {
  email: "",
  password: "",
  confirmPassword: "",
};

export const meta: Route.MetaFunction = () => [
  { title: "Registro de academia | En Escena" },
];

export { publicAccessRouteLoader as loader } from "@/lib/auth/public-access-route.server";

export async function action({ request }: Route.ActionArgs) {
  const formResult = await parsePublicAccessForm({
    request,
    schema: requestRegistrationSchema,
    fieldNames: registrationFields,
    preservedValueFields: ["email"],
  });

  if (!formResult.ok) {
    return formResult.response;
  }

  const result = await startAcademyRegistration({
    email: formResult.data.email,
    password: formResult.data.password,
    request,
    requestUrl: request.url,
  });

  return buildPublicAccessFormSuccess<RegistrationField, RegistrationValues>({
    message: result.message,
    values: formResult.values,
    headers: result.headers,
  });
}

export default function RegistroRoute() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = isPublicAccessFormSubmitting(navigation);
  const form = useAccessForm({
    schema: requestRegistrationSchema,
    values: actionData?.values ?? emptyRegistrationValues,
  });

  useServerActionToast(actionData, {
    toastId: getPublicAccessResultToastId({
      status: actionData?.status,
      successToastId: authToastIds.registrationResult,
      errorToastId: authToastIds.registrationError,
    }),
  });

  return (
    <AccessPage>
      <AccessHeader
        eyebrow="Portal de academias"
        title="Registrá tu academia"
        description="Ingresá tu correo y definí una contraseña. Si el correo puede registrarse, te vamos a enviar un enlace para confirmar la cuenta y seguir con el alta."
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

          <AccessTextField
            autoComplete="new-password"
            controller={form}
            label="Contraseña"
            name="password"
            type="password"
          />

          <AccessTextField
            autoComplete="new-password"
            controller={form}
            label="Confirmar contraseña"
            name="confirmPassword"
            type="password"
          />

          <Button className="w-full" type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <LoaderCircle
                aria-hidden="true"
                className="animate-spin"
                data-icon
              />
            ) : null}
            Continuar con el registro
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

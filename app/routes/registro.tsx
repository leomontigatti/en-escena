import { LoaderCircle } from "lucide-react";
import { data, Form, useActionData, useNavigation } from "react-router";
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
  readFormValue,
  requiredTextField,
} from "@/lib/auth/access-form.shared";
import { redirectSignedInUserFromPublicRoute } from "@/lib/auth/internal-navigation.server";
import {
  getEmptyFieldErrors,
  getFieldErrors,
} from "@/lib/shared/form-validation";
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

export async function loader({ request }: Route.LoaderArgs) {
  await redirectSignedInUserFromPublicRoute(request);

  return null;
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const values = {
    email: readFormValue(formData.get("email")),
    password: "",
    confirmPassword: "",
  } satisfies RegistrationValues;
  const parsed = requestRegistrationSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return {
      status: "error" as const,
      message: "Revisá los campos marcados.",
      fieldErrors: getFieldErrors(parsed.error, registrationFields),
      values,
    };
  }

  const result = await startAcademyRegistration({
    email: parsed.data.email,
    password: parsed.data.password,
    request,
    requestUrl: request.url,
  });

  return data(
    {
      status: "success" as const,
      message: result.message,
      fieldErrors: getEmptyFieldErrors<RegistrationField>(),
      values,
    },
    {
      headers: result.headers,
    },
  );
}

export default function RegistroRoute() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state !== "idle";
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

function getRegistrationToastId(status: "success" | "error" | undefined) {
  if (status === "success") {
    return authToastIds.registrationResult;
  }

  return authToastIds.registrationError;
}

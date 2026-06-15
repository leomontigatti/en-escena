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
import {
  completeAcademyRegistration,
  getRegistrationTokenStatus,
} from "@/lib/academies/registration.server";
import {
  authToastIds,
  passwordField,
  readFormValue,
  requiredTextField,
} from "@/lib/auth/access-form.shared";
import {
  getEmptyFieldErrors,
  getFieldErrors,
} from "@/lib/shared/form-validation";
import { useServerActionToast } from "@/lib/shared/toasts";

import type { Route } from "./+types/registro_.$token";

const completeRegistrationSchema = z
  .object({
    academyName: requiredTextField(),
    contactName: requiredTextField(),
    phone: requiredTextField(),
    password: passwordField(),
    confirmPassword: requiredTextField(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Las contraseñas no coinciden.",
    path: ["confirmPassword"],
  });
const completeRegistrationFields = [
  "academyName",
  "contactName",
  "phone",
  "password",
  "confirmPassword",
] as const;
type CompleteRegistrationField = (typeof completeRegistrationFields)[number];
type CompleteRegistrationValues = {
  academyName: string;
  contactName: string;
  phone: string;
  password: string;
  confirmPassword: string;
};

const emptyCompleteRegistrationValues: CompleteRegistrationValues = {
  academyName: "",
  contactName: "",
  phone: "",
  password: "",
  confirmPassword: "",
};

export const meta: Route.MetaFunction = () => [
  { title: "Completar registro | En Escena" },
];

export async function loader({ params }: Route.LoaderArgs) {
  const token = params.token;

  if (!token) {
    return { tokenStatus: "invalid" as const };
  }

  return { tokenStatus: await getRegistrationTokenStatus(token) };
}

export async function action({ request, params }: Route.ActionArgs) {
  const token = params.token;

  if (!token) {
    return {
      status: "error" as const,
      message: "El enlace no es válido.",
      fieldErrors: getEmptyFieldErrors<CompleteRegistrationField>(),
      values: emptyCompleteRegistrationValues,
    };
  }

  const formData = await request.formData();
  const values = {
    academyName: readFormValue(formData.get("academyName")),
    contactName: readFormValue(formData.get("contactName")),
    phone: readFormValue(formData.get("phone")),
    password: "",
    confirmPassword: "",
  } satisfies CompleteRegistrationValues;
  const parsed = completeRegistrationSchema.safeParse({
    academyName: formData.get("academyName"),
    contactName: formData.get("contactName"),
    phone: formData.get("phone"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return {
      status: "error" as const,
      message: "Revisá los campos marcados.",
      fieldErrors: getFieldErrors(parsed.error, completeRegistrationFields),
      values,
    };
  }

  const result = await completeAcademyRegistration({
    token,
    academyName: parsed.data.academyName,
    contactName: parsed.data.contactName,
    phone: parsed.data.phone,
    password: parsed.data.password,
    request,
  });

  if (!result.ok) {
    return {
      status: "error" as const,
      message: result.error,
      fieldErrors: getEmptyFieldErrors<CompleteRegistrationField>(),
      values,
    };
  }

  throw redirect("/portal", { headers: result.headers });
}

export default function CompletarRegistroRoute() {
  const { tokenStatus } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const form = useAccessForm({
    schema: completeRegistrationSchema,
    values: actionData?.values ?? emptyCompleteRegistrationValues,
    fieldErrors: actionData?.fieldErrors,
  });

  useServerActionToast(actionData, {
    toastId: authToastIds.registrationError,
  });

  if (tokenStatus === "invalid") {
    return (
      <AccessPage>
        <AccessHeader
          eyebrow="Enlace inválido"
          title="No pudimos abrir este registro"
          tone="danger"
          description="El enlace ya fue usado o expiró. Podés pedir uno nuevo para completar el registro de la academia."
        />
        <AccessSecondaryLink to="/registro" className="mt-8 w-full">
          Pedir nuevo enlace
        </AccessSecondaryLink>
      </AccessPage>
    );
  }

  return (
    <AccessPage width="lg">
      <AccessHeader
        eyebrow="Registro habilitado"
        title="Completá los datos"
        description="Estos datos pertenecen a la academia. El usuario de acceso queda asociado al correo confirmado por el enlace."
      />

      <Form
        method="post"
        noValidate
        className="mt-8"
        onSubmit={form.handleSubmit}
      >
        <FieldGroup>
          <AccessTextField
            autoComplete="organization"
            controller={form}
            label="Nombre de la academia"
            name="academyName"
          />

          <AccessTextField
            autoComplete="name"
            controller={form}
            label="Nombre de contacto"
            name="contactName"
          />

          <AccessTextField
            autoComplete="tel"
            controller={form}
            inputMode="tel"
            label="Teléfono"
            name="phone"
            type="tel"
          />

          <div className="grid gap-5 sm:grid-cols-2">
            <AccessTextField
              autoComplete="new-password"
              controller={form}
              description="Usá al menos 8 caracteres."
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
          </div>

          <Button className="w-full" type="submit">
            Crear academia e ingresar
          </Button>
        </FieldGroup>
      </Form>
    </AccessPage>
  );
}

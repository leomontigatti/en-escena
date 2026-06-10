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
import {
  completeAcademyRegistration,
  getRegistrationTokenStatus,
} from "@/lib/academy-registration.server";
import { getEmptyFieldErrors, getFieldErrors } from "@/lib/form-validation";

import type { Route } from "./+types/registro_.$token";

const completeRegistrationSchema = z
  .object({
    academyName: z.string().trim().min(1, "Ingresá el nombre de la academia."),
    contactName: z.string().trim().min(1, "Ingresá el nombre de contacto."),
    phone: z.string().trim().min(1, "Ingresá un teléfono de contacto."),
    password: z
      .string()
      .min(8, "La contraseña debe tener al menos 8 caracteres."),
    confirmPassword: z.string(),
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
    };
  }

  const formData = await request.formData();
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
    };
  }

  throw redirect("/portal", { headers: result.headers });
}

export default function CompletarRegistroRoute() {
  const { tokenStatus } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

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

      <Form method="post" className="mt-8 space-y-5">
        <AccessField
          id="academyName"
          label="Nombre de la academia"
          error={actionData?.fieldErrors.academyName}
          inputProps={{
            name: "academyName",
            required: true,
            autoComplete: "organization",
          }}
        />

        <AccessField
          id="contactName"
          label="Nombre de contacto"
          error={actionData?.fieldErrors.contactName}
          inputProps={{
            name: "contactName",
            required: true,
            autoComplete: "name",
          }}
        />

        <AccessField
          id="phone"
          label="Teléfono"
          error={actionData?.fieldErrors.phone}
          inputProps={{
            name: "phone",
            type: "tel",
            required: true,
            autoComplete: "tel",
            inputMode: "tel",
          }}
        />

        <div className="grid gap-5 sm:grid-cols-2">
          <AccessField
            id="password"
            label="Contraseña"
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
        </div>

        {actionData ? (
          <AccessNotice variant="error">{actionData.message}</AccessNotice>
        ) : null}

        <button type="submit" className={accessButtonClassName}>
          Crear academia e ingresar
        </button>
      </Form>
    </AccessPage>
  );
}

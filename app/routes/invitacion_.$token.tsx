import { Form, redirect, useActionData, useLoaderData } from "react-router";
import { z } from "zod";

import {
  AccessField,
  AccessHeader,
  AccessNotice,
  AccessPage,
  AccessSecondaryLink,
  accessButtonClassName,
} from "@/components/auth/access-ui";
import {
  getEmptyFieldErrors,
  getFieldErrors,
} from "@/lib/shared/form-validation";
import { getLandingPathForUserId } from "@/lib/auth/internal-navigation.server";
import {
  completeInternalUserInvitation,
  getInternalInvitationTokenStatus,
} from "@/lib/admin/users/user-invitation.server";

import type { Route } from "./+types/invitacion_.$token";

const completeInvitationSchema = z
  .object({
    password: z
      .string()
      .min(8, "La contraseña debe tener al menos 8 caracteres."),
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Las contraseñas no coinciden.",
    path: ["confirmPassword"],
  });
const completeInvitationFields = ["password", "confirmPassword"] as const;
type CompleteInvitationField = (typeof completeInvitationFields)[number];

export const meta: Route.MetaFunction = () => [
  { title: "Completar invitación | En Escena" },
];

export async function loader({ params }: Route.LoaderArgs) {
  const token = params.token;

  if (!token) {
    return { tokenStatus: "invalid" as const };
  }

  return { tokenStatus: await getInternalInvitationTokenStatus(token) };
}

export async function action({ request, params }: Route.ActionArgs) {
  const token = params.token;

  if (!token) {
    return {
      status: "error" as const,
      message: "El enlace no es válido.",
      fieldErrors: getEmptyFieldErrors<CompleteInvitationField>(),
    };
  }

  const formData = await request.formData();
  const parsed = completeInvitationSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return {
      status: "error" as const,
      message: "Revisá los campos marcados.",
      fieldErrors: getFieldErrors(parsed.error, completeInvitationFields),
    };
  }

  const result = await completeInternalUserInvitation({
    token,
    password: parsed.data.password,
    request,
  });

  if (!result.ok) {
    return {
      status: "error" as const,
      message: result.error,
      fieldErrors: getEmptyFieldErrors<CompleteInvitationField>(),
    };
  }

  throw redirect(await getLandingPathForUserId(result.userId), {
    headers: result.headers,
  });
}

export default function CompletarInvitacionRoute() {
  const { tokenStatus } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  if (tokenStatus === "invalid") {
    return (
      <AccessPage>
        <AccessHeader
          eyebrow="Enlace inválido"
          title="No pudimos abrir esta invitación"
          tone="danger"
          description="El enlace ya fue usado o expiró. Pedile a administración una nueva invitación."
        />
        <AccessSecondaryLink to="/ingresar" className="mt-8 w-full">
          Ir a ingresar
        </AccessSecondaryLink>
      </AccessPage>
    );
  }

  return (
    <AccessPage>
      <AccessHeader
        eyebrow="Invitación habilitada"
        title="Definí tu contraseña"
        description="El permiso interno ya fue definido por administración. Completá tu acceso con una contraseña propia."
      />

      <Form method="post" className="mt-8 space-y-5">
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

        {actionData ? (
          <AccessNotice variant="error">{actionData.message}</AccessNotice>
        ) : null}

        <button type="submit" className={accessButtonClassName}>
          Completar invitación
        </button>
      </Form>
    </AccessPage>
  );
}

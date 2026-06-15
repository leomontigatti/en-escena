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
  authToastIds,
  passwordField,
  passwordMismatchMessage,
  requiredTextField,
} from "@/lib/auth/access-form.shared";
import {
  getEmptyFieldErrors,
  getFieldErrors,
} from "@/lib/shared/form-validation";
import { getLandingPathForUserId } from "@/lib/auth/internal-navigation.server";
import { useServerActionToast } from "@/lib/shared/toasts";
import {
  completeInternalUserInvitation,
  getInternalInvitationTokenStatus,
} from "@/lib/admin/users/user-invitation.server";

import type { Route } from "./+types/invitacion_.$token";

const completeInvitationSchema = z
  .object({
    password: passwordField(),
    confirmPassword: requiredTextField(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: passwordMismatchMessage,
    path: ["confirmPassword"],
  });
const completeInvitationFields = ["password", "confirmPassword"] as const;
type CompleteInvitationField = (typeof completeInvitationFields)[number];
type CompleteInvitationValues = {
  password: string;
  confirmPassword: string;
};

const emptyCompleteInvitationValues: CompleteInvitationValues = {
  password: "",
  confirmPassword: "",
};

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
      values: emptyCompleteInvitationValues,
    };
  }

  const formData = await request.formData();
  const values = emptyCompleteInvitationValues;
  const parsed = completeInvitationSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return {
      status: "error" as const,
      message: "Revisá los campos marcados.",
      fieldErrors: getFieldErrors(parsed.error, completeInvitationFields),
      values,
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
      values,
    };
  }

  throw redirect(await getLandingPathForUserId(result.userId), {
    headers: result.headers,
  });
}

export default function CompletarInvitacionRoute() {
  const { tokenStatus } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const form = useAccessForm({
    schema: completeInvitationSchema,
    values: actionData?.values ?? emptyCompleteInvitationValues,
    fieldErrors: actionData?.fieldErrors,
  });

  useServerActionToast(actionData, {
    toastId: authToastIds.invitationError,
  });

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

      <Form
        method="post"
        noValidate
        className="mt-8"
        onSubmit={form.handleSubmit}
      >
        <FieldGroup>
          <AccessTextField
            controller={form}
            autoComplete="new-password"
            description="Usá al menos 8 caracteres."
            label="Contraseña"
            name="password"
            type="password"
          />

          <AccessTextField
            controller={form}
            autoComplete="new-password"
            label="Confirmar contraseña"
            name="confirmPassword"
            type="password"
          />

          <Button className="w-full" type="submit">
            Completar invitación
          </Button>
        </FieldGroup>
      </Form>
    </AccessPage>
  );
}

import {
  Form,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";
import { z } from "zod";

import { AccessHeader, AccessPage } from "@/components/auth/access-ui";
import { AccessTextField, useAccessForm } from "@/components/auth/access-form";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import {
  exchangeAccessRecoveryCode,
  updateAccessRecoveryPassword,
  verifyAccessRecoveryTokenHash,
} from "@/lib/auth/access-recovery.server";
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
import { recoverableClientAction } from "@/lib/shared/recoverable-client-action";
import { useServerActionToast } from "@/lib/shared/toasts";

import type { Route } from "./+types/cambiar-contrasena";

// Academy access recovery only: an internal user's password is set by an
// administrator from the panel and never changed here.
const passwordConfirmationSchema = z
  .object({
    newPassword: passwordField(),
    confirmPassword: requiredTextField(),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: passwordMismatchMessage,
    path: ["confirmPassword"],
  });
const recoveryChangeFields = ["newPassword", "confirmPassword"] as const;
type RecoveryChangeField = (typeof recoveryChangeFields)[number];
type RecoveryChangeValues = {
  newPassword: string;
  confirmPassword: string;
};

const emptyRecoveryChangeValues: RecoveryChangeValues = {
  newPassword: "",
  confirmPassword: "",
};

export const meta: Route.MetaFunction = () => [
  { title: "Cambiar contraseña | En Escena" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const recoveryCode = url.searchParams.get("code");
  const recoveryTokenHash = url.searchParams.get("token_hash");
  const recoveryType = url.searchParams.get("type");
  const isRecoveryFlow = url.searchParams.get("recuperacion") === "1";

  if (recoveryCode) {
    const result = await exchangeAccessRecoveryCode({
      code: recoveryCode,
      request,
      redirectTo: "/cambiar-contrasena?recuperacion=1",
    });

    if (!result.ok) {
      return {
        mode: "recovery-invalid" as const,
      };
    }

    throw redirect(result.redirectTo, { headers: result.headers });
  }

  if (recoveryTokenHash && recoveryType === "recovery") {
    const result = await verifyAccessRecoveryTokenHash({
      request,
      tokenHash: recoveryTokenHash,
      redirectTo: "/cambiar-contrasena?recuperacion=1",
    });

    if (!result.ok) {
      return {
        mode: "recovery-invalid" as const,
      };
    }

    throw redirect(result.redirectTo, { headers: result.headers });
  }

  if (isRecoveryFlow) {
    return {
      mode: "recovery" as const,
    };
  }

  // Nothing to change without a recovery in progress.
  throw redirect("/ingresar");
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const values = emptyRecoveryChangeValues;
  const parsed = passwordConfirmationSchema.safeParse({
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return {
      status: "error" as const,
      message: "Revisá los datos del formulario.",
      fieldErrors: getFieldErrors(parsed.error, recoveryChangeFields),
      values,
    };
  }

  const result = await updateAccessRecoveryPassword({
    newPassword: parsed.data.newPassword,
    request,
  });

  if (!result.ok) {
    return {
      status: "error" as const,
      message: result.error,
      fieldErrors: getEmptyFieldErrors<RecoveryChangeField>(),
      values,
    };
  }

  throw redirect("/ingresar?recuperacion=ok", { headers: result.headers });
}

export async function clientAction({ serverAction }: Route.ClientActionArgs) {
  return await recoverableClientAction(serverAction);
}

export default function CambiarContrasenaRoute() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  if (loaderData.mode === "recovery-invalid") {
    return (
      <AccessPage>
        <AccessHeader
          eyebrow="Enlace inválido"
          title="No pudimos recuperar tu acceso"
          tone="danger"
          description="El enlace ya fue usado o expiró. Pedí uno nuevo para definir otra contraseña."
        />
      </AccessPage>
    );
  }

  return <RecoveryPasswordChangeForm actionData={actionData} />;
}

function RecoveryPasswordChangeForm({
  actionData,
}: {
  actionData: ReturnType<typeof useActionData<typeof action>>;
}) {
  const navigation = useNavigation();
  const isSubmitting =
    navigation.state !== "idle" &&
    navigation.formMethod?.toLowerCase() === "post";
  const form = useAccessForm({
    schema: passwordConfirmationSchema,
    values: actionData?.values ?? emptyRecoveryChangeValues,
  });

  useServerActionToast(actionData, {
    toastId: authToastIds.resetPasswordError,
  });

  return (
    <AccessPage>
      <AccessHeader
        eyebrow="Recuperación habilitada"
        title="Definí una nueva contraseña"
        description="La recuperación solo cambia tus credenciales. Tus permisos y datos de academia no se modifican."
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
            label="Nueva contraseña"
            name="newPassword"
            placeholder="Usá al menos 8 caracteres."
            type="password"
          />

          <AccessTextField
            controller={form}
            autoComplete="new-password"
            label="Confirmar contraseña"
            name="confirmPassword"
            type="password"
          />

          <Button className="w-full" type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <Spinner aria-hidden="true" data-icon="inline-start" />
            ) : null}
            Guardar contraseña
          </Button>
        </FieldGroup>
      </Form>
    </AccessPage>
  );
}

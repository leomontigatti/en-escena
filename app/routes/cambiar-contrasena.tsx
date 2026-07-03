import { LoaderCircle } from "lucide-react";
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
import {
  exchangeAccessRecoveryCode,
  updateAccessRecoveryPassword,
  verifyAccessRecoveryTokenHash,
} from "@/lib/auth/access-recovery.server";
import {
  completeMandatoryPasswordChange,
  requireMandatoryPasswordChangeUser,
} from "@/lib/auth/mandatory-password-change.server";
import { withSupabaseSsrHeaders } from "@/lib/auth/supabase-auth-ssr.server";
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
import { useServerActionToast } from "@/lib/shared/toasts";

import type { Route } from "./+types/cambiar-contrasena";

const passwordConfirmationSchema = z
  .object({
    newPassword: passwordField(),
    confirmPassword: requiredTextField(),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: passwordMismatchMessage,
    path: ["confirmPassword"],
  });
const changePasswordSchema = passwordConfirmationSchema.extend({
  currentPassword: requiredTextField(),
});
const mandatoryChangeFields = [
  "currentPassword",
  "newPassword",
  "confirmPassword",
] as const;
const recoveryChangeFields = ["newPassword", "confirmPassword"] as const;
type MandatoryChangeField = (typeof mandatoryChangeFields)[number];
type RecoveryChangeField = (typeof recoveryChangeFields)[number];
type MandatoryChangeValues = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};
type RecoveryChangeValues = {
  newPassword: string;
  confirmPassword: string;
};

const emptyMandatoryChangeValues: MandatoryChangeValues = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
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

    throw redirect(
      result.redirectTo,
      withSupabaseSsrHeaders({ headers: result.headers }),
    );
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

    throw redirect(
      result.redirectTo,
      withSupabaseSsrHeaders({ headers: result.headers }),
    );
  }

  if (isRecoveryFlow) {
    return {
      mode: "recovery" as const,
    };
  }

  await requireMandatoryPasswordChangeUser(request);

  return {
    mode: "mandatory" as const,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const mode = readFormMode(formData.get("mode"));

  if (mode === "recovery") {
    const values = emptyRecoveryChangeValues;
    const parsed = passwordConfirmationSchema.safeParse({
      newPassword: formData.get("newPassword"),
      confirmPassword: formData.get("confirmPassword"),
    });

    if (!parsed.success) {
      return {
        status: "error" as const,
        message: "Revisá los campos marcados.",
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

    throw redirect(
      "/ingresar?recuperacion=ok",
      withSupabaseSsrHeaders({ headers: result.headers }),
    );
  }

  const values = emptyMandatoryChangeValues;
  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return {
      status: "error" as const,
      message: "Revisá los campos marcados.",
      fieldErrors: getFieldErrors(parsed.error, mandatoryChangeFields),
      values,
    };
  }

  const result = await completeMandatoryPasswordChange({
    request,
    currentPassword: parsed.data.currentPassword,
    newPassword: parsed.data.newPassword,
  });

  if (!result.ok) {
    return {
      status: "error" as const,
      message: result.error,
      fieldErrors: getEmptyFieldErrors<MandatoryChangeField>(),
      values,
    };
  }

  throw redirect(result.redirectTo);
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

  const isRecoveryFlow = loaderData.mode === "recovery";

  return isRecoveryFlow ? (
    <RecoveryPasswordChangeForm actionData={actionData} />
  ) : (
    <MandatoryPasswordChangeForm actionData={actionData} />
  );
}

function MandatoryPasswordChangeForm({
  actionData,
}: {
  actionData: ReturnType<typeof useActionData<typeof action>>;
}) {
  const mandatoryActionData = isMandatoryActionData(actionData)
    ? actionData
    : null;
  const navigation = useNavigation();
  const isSubmitting =
    navigation.state !== "idle" &&
    navigation.formMethod?.toLowerCase() === "post";
  const form = useAccessForm({
    schema: changePasswordSchema,
    values: mandatoryActionData?.values ?? emptyMandatoryChangeValues,
  });

  useServerActionToast(actionData, {
    toastId: authToastIds.mandatoryPasswordChangeError,
  });

  return (
    <AccessPage>
      <AccessHeader
        eyebrow="Cambio obligatorio"
        title="Definí una nueva contraseña"
        description="Antes de entrar a tu área privada, reemplazá la contraseña temporal por una propia."
      />

      <Form
        method="post"
        noValidate
        className="mt-8"
        onSubmit={form.handleSubmit}
      >
        <input type="hidden" name="mode" value="mandatory" />
        <FieldGroup>
          <AccessTextField
            controller={form}
            autoComplete="current-password"
            label="Contraseña actual"
            name="currentPassword"
            type="password"
          />

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
              <LoaderCircle
                aria-hidden="true"
                className="animate-spin"
                data-icon
              />
            ) : null}
            Guardar contraseña
          </Button>
        </FieldGroup>
      </Form>
    </AccessPage>
  );
}

function RecoveryPasswordChangeForm({
  actionData,
}: {
  actionData: ReturnType<typeof useActionData<typeof action>>;
}) {
  const recoveryActionData = isRecoveryActionData(actionData)
    ? actionData
    : null;
  const navigation = useNavigation();
  const isSubmitting =
    navigation.state !== "idle" &&
    navigation.formMethod?.toLowerCase() === "post";
  const form = useAccessForm({
    schema: passwordConfirmationSchema,
    values: recoveryActionData?.values ?? emptyRecoveryChangeValues,
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
        <input type="hidden" name="mode" value="recovery" />
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
              <LoaderCircle
                aria-hidden="true"
                className="animate-spin"
                data-icon
              />
            ) : null}
            Guardar contraseña
          </Button>
        </FieldGroup>
      </Form>
    </AccessPage>
  );
}

function readFormMode(value: FormDataEntryValue | null) {
  return value === "recovery" ? "recovery" : "mandatory";
}

function isMandatoryActionData(
  actionData: ReturnType<typeof useActionData<typeof action>>,
): actionData is {
  status: "error";
  message: string;
  fieldErrors: Record<MandatoryChangeField, string | undefined>;
  values: MandatoryChangeValues;
} {
  return !!actionData && "currentPassword" in actionData.values;
}

function isRecoveryActionData(
  actionData: ReturnType<typeof useActionData<typeof action>>,
): actionData is {
  status: "error";
  message: string;
  fieldErrors: Record<RecoveryChangeField, string | undefined>;
  values: RecoveryChangeValues;
} {
  return !!actionData && !("currentPassword" in actionData.values);
}

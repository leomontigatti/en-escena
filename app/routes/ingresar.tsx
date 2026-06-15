import { Form, redirect, useActionData, useSearchParams } from "react-router";
import { z } from "zod";

import {
  AccessField,
  AccessHeader,
  AccessNotice,
  AccessPage,
  AccessTextLink,
  accessButtonClassName,
} from "@/components/auth/access-ui";
import { getSafeRedirectTo } from "@/lib/auth/access-redirects.server";
import type { LoginRedirectReason } from "@/lib/auth/access-redirects.server";
import { auth } from "@/lib/auth/auth.server";
import { findCredentialUserForIdentifier } from "@/lib/auth/internal-login.server";
import {
  getEmptyFieldErrors,
  getFieldErrors,
} from "@/lib/shared/form-validation";
import {
  getPostLoginPathForUserId,
  redirectSignedInUserFromPublicRoute,
} from "@/lib/auth/internal-navigation.server";

import type { Route } from "./+types/ingresar";

const requiredTextField = (message: string) =>
  z.preprocess(
    (value) => (typeof value === "string" ? value : ""),
    z.string().trim().min(1, message),
  );

const signInSchema = z.object({
  identifier: requiredTextField(
    "Ingresá tu correo o nombre de usuario interno.",
  ),
  password: requiredTextField("Ingresá tu contraseña."),
});
const signInFields = ["identifier", "password"] as const;
type SignInField = (typeof signInFields)[number];
type LoginNotice = {
  variant: "error" | "info" | "success";
  message: string;
};

const loginNotices = {
  continuar: {
    variant: "info",
    message: "Ingresá para continuar.",
  },
  expirada: {
    variant: "error",
    message: "Tu sesión expiró. Volvé a ingresar.",
  },
} satisfies Record<LoginRedirectReason, LoginNotice>;

const recoverySuccessNotice = {
  variant: "success",
  message: "Tu contraseña fue actualizada. Ya podés ingresar.",
} satisfies LoginNotice;

const logoutSuccessNotice = {
  variant: "success",
  message: "Cerraste sesión.",
} satisfies LoginNotice;

export const meta: Route.MetaFunction = () => [
  { title: "Ingresar | En Escena" },
];

export async function loader({ request }: Route.LoaderArgs) {
  await redirectSignedInUserFromPublicRoute(request);

  return null;
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const parsed = signInSchema.safeParse({
    identifier: formData.get("identifier"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      status: "error" as const,
      message: "Revisá los campos marcados.",
      fieldErrors: getFieldErrors(parsed.error, signInFields),
    };
  }

  try {
    const credentialUser = await findCredentialUserForIdentifier(
      parsed.data.identifier,
    );

    if (!credentialUser) {
      return genericLoginError();
    }

    if (credentialUser.match === "email" && !credentialUser.emailVerified) {
      return genericLoginError();
    }

    const result = await auth.api.signInEmail({
      body: {
        email: credentialUser.email,
        password: parsed.data.password,
      },
      headers: request.headers,
      returnHeaders: true,
    });

    throw redirect(
      await getPostLoginPathForUserId(
        result.response.user.id,
        getSafeRedirectTo(request),
      ),
      {
        headers: result.headers,
      },
    );
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }

    return {
      status: "error" as const,
      message: "No pudimos ingresar con esos datos.",
      fieldErrors: getEmptyFieldErrors<SignInField>(),
    };
  }
}

export function getLoginNotice(
  searchParams: URLSearchParams,
): LoginNotice | null {
  const reason = searchParams.get("motivo");

  if (isLoginRedirectReason(reason)) {
    return loginNotices[reason];
  }

  if (searchParams.get("sesion") === "cerrada") {
    return logoutSuccessNotice;
  }

  if (searchParams.get("recuperacion") === "ok") {
    return recoverySuccessNotice;
  }

  return null;
}

function isLoginRedirectReason(
  reason: string | null,
): reason is LoginRedirectReason {
  return reason === "continuar" || reason === "expirada";
}

function genericLoginError() {
  return {
    status: "error" as const,
    message: "No pudimos ingresar con esos datos.",
    fieldErrors: getEmptyFieldErrors<SignInField>(),
  };
}

export default function IngresarRoute() {
  const actionData = useActionData<typeof action>();
  const [searchParams] = useSearchParams();
  const loginNotice = getLoginNotice(searchParams);

  return (
    <AccessPage>
      <AccessHeader
        eyebrow="En Escena"
        title="Ingresar"
        description="Accedé al portal de academias o al panel interno según tu permiso."
      />

      <Form method="post" className="mt-8 space-y-5">
        <AccessField
          id="identifier"
          label="Correo o Nombre de usuario interno"
          error={actionData?.fieldErrors.identifier}
          inputProps={{
            name: "identifier",
            type: "text",
            required: true,
            autoComplete: "username",
            spellCheck: false,
          }}
        />

        <AccessField
          id="password"
          label="Contraseña"
          error={actionData?.fieldErrors.password}
          inputProps={{
            name: "password",
            type: "password",
            required: true,
            autoComplete: "current-password",
          }}
        />

        {actionData ? (
          <AccessNotice variant="error">{actionData.message}</AccessNotice>
        ) : null}

        {loginNotice ? (
          <AccessNotice variant={loginNotice.variant}>
            {loginNotice.message}
          </AccessNotice>
        ) : null}

        <button type="submit" className={accessButtonClassName}>
          Ingresar
        </button>
      </Form>

      <p className="mt-6 text-center text-sm text-slate-600">
        ¿No recordás tu contraseña?{" "}
        <AccessTextLink to="/recuperar-acceso">Recuperar acceso</AccessTextLink>
      </p>

      <p className="mt-3 text-center text-sm text-slate-600">
        ¿Tu academia todavía no está registrada?{" "}
        <AccessTextLink to="/registro">Pedir enlace</AccessTextLink>
      </p>
    </AccessPage>
  );
}

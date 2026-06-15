import { Form, redirect, useActionData, useSearchParams } from "react-router";
import { z } from "zod";
import { eq } from "drizzle-orm";

import {
  AccessField,
  AccessHeader,
  AccessNotice,
  AccessPage,
  AccessTextLink,
  accessButtonClassName,
} from "@/components/auth/access-ui";
import { db } from "@/db";
import { user } from "@/db/schema";
import { getSafeRedirectTo } from "@/lib/auth/access-redirects.server";
import type { LoginRedirectReason } from "@/lib/auth/access-redirects.server";
import { normalizeEmail } from "@/lib/academies/registration-token.server";
import { auth } from "@/lib/auth/auth.server";
import {
  getEmptyFieldErrors,
  getFieldErrors,
} from "@/lib/shared/form-validation";
import {
  getLandingPathForUserId,
  redirectSignedInUserFromPublicRoute,
} from "@/lib/auth/internal-navigation.server";

import type { Route } from "./+types/ingresar";

const signInSchema = z.object({
  email: z.email("Ingresá un correo electrónico válido."),
  password: z.string().min(1, "Ingresá tu contraseña."),
});
const signInFields = ["email", "password"] as const;
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
    email: formData.get("email"),
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
    const credentialUser = await db.query.user.findFirst({
      columns: { emailVerified: true },
      where: eq(user.email, normalizeEmail(parsed.data.email)),
    });

    if (credentialUser && !credentialUser.emailVerified) {
      return genericLoginError();
    }

    const result = await auth.api.signInEmail({
      body: {
        email: parsed.data.email,
        password: parsed.data.password,
      },
      headers: request.headers,
      returnHeaders: true,
    });

    throw redirect(
      getSafeRedirectTo(request) ??
        (await getLandingPathForUserId(result.response.user.id)),
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
          id="email"
          label="Correo"
          error={actionData?.fieldErrors.email}
          inputProps={{
            name: "email",
            type: "email",
            required: true,
            autoComplete: "email",
            inputMode: "email",
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

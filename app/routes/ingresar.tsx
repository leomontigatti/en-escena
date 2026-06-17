import { useEffect } from "react";
import {
  Form,
  redirect,
  useActionData,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router";
import { z } from "zod";

import {
  AccessHeader,
  AccessPage,
  AccessTextLink,
} from "@/components/auth/access-ui";
import { AccessTextField, useAccessForm } from "@/components/auth/access-form";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { accessAuthProvider } from "@/lib/auth/access-auth-provider.server";
import { getSafeRedirectTo } from "@/lib/auth/access-redirects.server";
import { withSupabaseSsrHeaders } from "@/lib/auth/supabase-auth-ssr.server";
import type { LoginRedirectReason } from "@/lib/auth/access-redirects.server";
import {
  authToastIds,
  loginNotices,
  logoutSuccessNotice,
  readFormValue,
  recoverySuccessNotice,
  requiredTextField,
  type LoginNotice,
} from "@/lib/auth/access-form.shared";
import { findCredentialUserForIdentifier } from "@/lib/auth/internal-login.server";
import {
  getPostLoginPathForUserId,
  redirectSignedInUserFromPublicRoute,
} from "@/lib/auth/internal-navigation.server";
import {
  getEmptyFieldErrors,
  getFieldErrors,
} from "@/lib/shared/form-validation";
import { showToastMessage, useServerActionToast } from "@/lib/shared/toasts";

import type { Route } from "./+types/ingresar";

const signInSchema = z.object({
  identifier: requiredTextField(),
  password: requiredTextField(),
});
const signInFields = ["identifier", "password"] as const;
type SignInField = (typeof signInFields)[number];
type SignInValues = {
  identifier: string;
  password: string;
};

const emptySignInValues: SignInValues = {
  identifier: "",
  password: "",
};

export const meta: Route.MetaFunction = () => [
  { title: "Ingresar | En Escena" },
];

export async function loader({ request }: Route.LoaderArgs) {
  await redirectSignedInUserFromPublicRoute(request);

  return null;
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const values = {
    identifier: readFormValue(formData.get("identifier")),
    password: "",
  } satisfies SignInValues;
  const parsed = signInSchema.safeParse({
    identifier: formData.get("identifier"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      status: "error" as const,
      message: "Revisá los campos marcados.",
      fieldErrors: getFieldErrors(parsed.error, signInFields),
      values,
    };
  }

  try {
    const credentialUser = await findCredentialUserForIdentifier(
      parsed.data.identifier,
    );

    if (!credentialUser) {
      return genericLoginError(values);
    }

    if (credentialUser.match === "email" && !credentialUser.emailVerified) {
      return genericLoginError(values);
    }

    if (credentialUser.suspended) {
      return genericLoginError(values);
    }

    const result = await accessAuthProvider.signInCredentialUser({
      email: credentialUser.email,
      password: parsed.data.password,
      request,
    });

    throw redirect(
      await getPostLoginPathForUserId(
        credentialUser.id,
        getSafeRedirectTo(request),
      ),
      withSupabaseSsrHeaders({ headers: result.headers }),
    );
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }

    return {
      status: "error" as const,
      message: "No pudimos ingresar con esos datos.",
      fieldErrors: getEmptyFieldErrors<SignInField>(),
      values,
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

export default function IngresarRoute() {
  const actionData = useActionData<typeof action>();
  const [searchParams] = useSearchParams();
  const loginNotice = getLoginNotice(searchParams);
  const form = useAccessForm({
    schema: signInSchema,
    values: actionData?.values ?? emptySignInValues,
    fieldErrors: actionData?.fieldErrors,
  });

  useServerActionToast(actionData, {
    toastId: authToastIds.loginError,
  });
  useLoginNoticeToast(loginNotice);

  return (
    <AccessPage>
      <AccessHeader
        eyebrow="En Escena"
        title="Ingresar"
        description="Accedé al portal de academias o al panel interno según tu permiso."
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
            autoComplete="username"
            label="Correo o Nombre de usuario interno"
            name="identifier"
            spellCheck={false}
            type="text"
          />

          <AccessTextField
            controller={form}
            autoComplete="current-password"
            label="Contraseña"
            name="password"
            type="password"
          />

          <Button className="w-full" type="submit">
            Ingresar
          </Button>
        </FieldGroup>
      </Form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        ¿No recordás tu contraseña?{" "}
        <AccessTextLink to="/recuperar-acceso">Recuperar acceso</AccessTextLink>
      </p>

      <p className="mt-3 text-center text-sm text-muted-foreground">
        ¿Tu academia todavía no está registrada?{" "}
        <AccessTextLink to="/registro">Pedir enlace</AccessTextLink>
      </p>
    </AccessPage>
  );
}

function genericLoginError(values: SignInValues) {
  return {
    status: "error" as const,
    message: "No pudimos ingresar con esos datos.",
    fieldErrors: getEmptyFieldErrors<SignInField>(),
    values,
  };
}

function useLoginNoticeToast(loginNotice: LoginNotice | null) {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loginNotice) {
      return;
    }

    window.setTimeout(() => {
      showToastMessage(loginNotice);
    }, 0);

    const searchParams = new URLSearchParams(location.search);
    searchParams.delete("motivo");
    searchParams.delete("recuperacion");
    searchParams.delete("sesion");
    const nextSearch = searchParams.toString();

    navigate(
      `${location.pathname}${nextSearch ? `?${nextSearch}` : ""}${location.hash}`,
      { replace: true },
    );
  }, [
    location.hash,
    location.pathname,
    location.search,
    loginNotice,
    navigate,
  ]);
}

import { useEffect } from "react";
import { LoaderCircle } from "lucide-react";
import {
  Form,
  redirect,
  useActionData,
  useLocation,
  useNavigate,
  useNavigation,
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
  recoverySuccessNotice,
  requiredTextField,
  type LoginNotice,
} from "@/lib/auth/access-form.shared";
import {
  isPublicAccessFormSubmitting,
  parsePublicAccessForm,
} from "@/lib/auth/public-access-route.shared";
import { findCredentialUserForIdentifier } from "@/lib/auth/internal-login.server";
import { getPostLoginPathForUserId } from "@/lib/auth/internal-navigation.server";
import { getEmptyFieldErrors } from "@/lib/shared/form-validation";
import { normalizeEmail } from "@/lib/shared/email-normalization";
import { showToastMessage, useServerActionToast } from "@/lib/shared/toasts";

import type { Route } from "./+types/ingresar";

const signInSchema = z.object({
  identifier: requiredTextField(),
  password: requiredTextField(),
});
const emailIdentifierSchema = z.email();
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

export { loadPublicAccessRouteLoader as loader } from "@/lib/auth/public-access-route.server";

export async function action({ request }: Route.ActionArgs) {
  const parsed = await parsePublicAccessForm({
    request,
    schema: signInSchema,
    fieldNames: signInFields,
    preservedValueFields: ["identifier"],
  });

  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const credentialUser = await findCredentialUserForIdentifier(
      parsed.data.identifier,
    );
    const accessEmail =
      credentialUser?.email ?? getEmailIdentifier(parsed.data.identifier);

    if (!accessEmail) {
      return genericLoginError(parsed.values);
    }

    if (credentialUser?.match === "email" && !credentialUser.emailVerified) {
      return genericLoginError(parsed.values);
    }

    if (credentialUser?.suspended) {
      return genericLoginError(parsed.values);
    }

    const result = await accessAuthProvider.signInCredentialUser({
      email: accessEmail,
      password: parsed.data.password,
      request,
    });

    throw redirect(
      await getPostLoginPathForUserId(
        result.userId,
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
      values: parsed.values,
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
  const navigation = useNavigation();
  const loginNotice = getLoginNotice(searchParams);
  const isSubmitting = isPublicAccessFormSubmitting(navigation);
  const form = useAccessForm({
    schema: signInSchema,
    values: actionData?.values ?? emptySignInValues,
  });

  useServerActionToast(actionData, {
    toastId: authToastIds.loginError,
  });
  useLoginNoticeToast(loginNotice);

  return (
    <AccessPage>
      <AccessHeader
        media={
          <span className="mx-auto mb-6 flex size-48 items-center justify-center overflow-hidden rounded-full bg-foreground">
            <img
              src="/en-escena-certamen-de-danzas.png"
              alt="En Escena"
              className="h-full w-full object-cover"
            />
          </span>
        }
        className="text-center"
        title="Ingresar"
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
            label="Correo electrónico"
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

          <Button className="w-full" type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <LoaderCircle
                aria-hidden="true"
                className="animate-spin"
                data-icon
              />
            ) : null}
            Ingresar
          </Button>
        </FieldGroup>
      </Form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        ¿No te acordás tu contraseña?{" "}
        <AccessTextLink to="/recuperar-acceso">Recuperala</AccessTextLink>
      </p>

      <p className="mt-3 text-center text-sm text-muted-foreground">
        ¿Todavía no te registraste?{" "}
        <AccessTextLink to="/registro">Hacelo acá</AccessTextLink>
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

function getEmailIdentifier(identifier: string) {
  const normalizedEmail = normalizeEmail(identifier);

  return emailIdentifierSchema.safeParse(normalizedEmail).success
    ? normalizedEmail
    : null;
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

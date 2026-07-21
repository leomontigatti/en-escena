import { redirect } from "react-router";

import { createSupabaseSessionClearHeaders } from "@/lib/auth/supabase-auth-ssr.server";

const LOGIN_PATH = "/ingresar";
const CONTINUE_REASON = "continuar";
const EXPIRED_REASON = "expirada";
// Cookie de sesión de Better Auth (default, sin `cookiePrefix` custom). Su
// presencia distingue una sesión vencida (`expirada`) de "nunca ingresó"
// (`continuar`). El prefijo `sb-` se conserva mientras siga el SSR de Supabase
// (decommission en #303/#423).
const BETTER_AUTH_SESSION_COOKIE_NAME = "better-auth.session_token";
const SUPABASE_COOKIE_NAME_PREFIX = "sb-";

export type LoginRedirectReason =
  | typeof CONTINUE_REASON
  | typeof EXPIRED_REASON;

export function redirectToLoginForRequest(request: Request): never {
  const reason = hasAccessSessionCookie(request)
    ? EXPIRED_REASON
    : CONTINUE_REASON;

  throw redirect(
    buildLoginRedirectUrl(request, reason),
    reason === EXPIRED_REASON
      ? { headers: createSupabaseSessionClearHeaders(request) }
      : undefined,
  );
}

export function getSafeRedirectTo(request: Request) {
  const redirectTo = new URL(request.url).searchParams.get("redirectTo");

  return isSafeInternalRedirect(redirectTo) ? redirectTo : null;
}

function isSafeInternalRedirect(value: string | null) {
  if (!value?.startsWith("/") || value.startsWith("//")) {
    return false;
  }

  try {
    const parsed = new URL(value, "http://localhost");

    return parsed.origin === "http://localhost";
  } catch {
    return false;
  }
}

function buildLoginRedirectUrl(request: Request, reason: LoginRedirectReason) {
  const loginUrl = new URL(LOGIN_PATH, request.url);
  loginUrl.searchParams.set("redirectTo", getRequestPath(request));
  loginUrl.searchParams.set("motivo", reason);

  return `${loginUrl.pathname}${loginUrl.search}`;
}

function getRequestPath(request: Request) {
  const url = new URL(request.url);

  return `${url.pathname}${url.search}`;
}

function hasAccessSessionCookie(request: Request) {
  return request.headers
    .get("cookie")
    ?.split(";")
    .some((cookie) => {
      const cookieName = cookie.trim().split("=")[0] ?? "";

      return (
        cookieName === BETTER_AUTH_SESSION_COOKIE_NAME ||
        cookieName.startsWith(SUPABASE_COOKIE_NAME_PREFIX)
      );
    });
}

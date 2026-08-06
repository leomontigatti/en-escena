import { redirect } from "react-router";

import {
  createLegacySessionCookieClearHeaders,
  LEGACY_SESSION_COOKIE_PREFIX,
} from "@/lib/auth/legacy-session-cookies.server";

const LOGIN_PATH = "/ingresar";
const CONTINUE_REASON = "continuar";
const EXPIRED_REASON = "expirada";
// Cookie de sesión de Better Auth (default, sin `cookiePrefix` custom). Su
// presencia distingue una sesión vencida (`expirada`) de "nunca ingresó"
// (`continuar`). Con un baseURL https, Better Auth activa `useSecureCookies` y
// emite el nombre con prefijo `__Secure-`, así que hay que reconocer ambos: en
// producción la cookie real es `__Secure-better-auth.session_token` (#501). El
// prefijo `sb-` se conserva solo por las cookies previas al cutover de auth; se
// retira junto con `legacy-session-cookies.server.ts` (#582).
const BETTER_AUTH_SESSION_COOKIE_NAME = "better-auth.session_token";
const BETTER_AUTH_SECURE_SESSION_COOKIE_NAME =
  "__Secure-better-auth.session_token";

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
      ? { headers: createLegacySessionCookieClearHeaders(request) }
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
        cookieName === BETTER_AUTH_SECURE_SESSION_COOKIE_NAME ||
        cookieName.startsWith(LEGACY_SESSION_COOKIE_PREFIX)
      );
    });
}

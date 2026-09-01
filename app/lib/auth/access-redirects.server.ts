import { redirect } from "react-router";

import {
  createLegacySessionCookieClearHeaders,
  LEGACY_SESSION_COOKIE_PREFIX,
} from "@/lib/auth/legacy-session-cookies.server";

const LOGIN_PATH = "/ingresar";
const CONTINUE_REASON = "continuar";
const EXPIRED_REASON = "expirada";
// Better Auth's session cookie (the default, with no custom `cookiePrefix`). Its
// presence distinguishes an expired session (`expirada`) from "never signed in"
// (`continuar`). With an https baseURL, Better Auth turns on `useSecureCookies`
// and emits the name with the `__Secure-` prefix, so both have to be recognized:
// in production the real cookie is `__Secure-better-auth.session_token` (#501).
// The `sb-` prefix is kept only for the cookies predating the auth cutover; it is
// retired together with `legacy-session-cookies.server.ts` (#582).
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

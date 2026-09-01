import { parse, serialize } from "cookie";

import { getSetCookieValues } from "@/lib/auth/set-cookie-headers";

// Exported so that the `sb-` branch of `access-redirects.server.ts` — the other
// place that still recognizes these cookies — depends on this constant and is
// retired together with the shim, rather than separately.
export const LEGACY_SESSION_COOKIE_PREFIX = "sb-";

// A migration shim, not a live integration (#582). Supabase Auth stopped being
// the credential provider in the forward-only consolidation onto Better Auth
// (#266) and the full exit from Supabase was recorded in ADR-0013; all that
// survives from that stage are the `sb-*` cookies left in the browser of anyone
// who signed in before the cutover. This function expires them so they do not
// coexist with the current session cookie.
//
// It only affects browsers with cookies predating the cutover: a fresh install
// never receives an `sb-*` cookie. It can be retired — together with the `sb-`
// branch of `access-redirects.server.ts` — once the maximum lifetime of those
// cookies has elapsed, or earlier if access telemetry stops recording any `sb-*`
// presence in requests.
//
// It does not depend on `@supabase/ssr`: it parses the request's cookie and
// serializes with the generic `cookie` library.
export function createLegacySessionCookieClearHeaders(request: Request) {
  const headers = new Headers();

  for (const name of getLegacySessionCookieNames(request)) {
    headers.append(
      "set-cookie",
      serialize(name, "", {
        expires: new Date(0),
        maxAge: 0,
        path: "/",
        sameSite: "lax",
      }),
    );
  }

  return headers;
}

// A variant for responses that already carry headers of their own (logout emits
// the provider's, which are the ones that close the current session). They are
// added with `append` instead of copying the headers into a new object because
// the `Headers` iterator collapses multiple `set-cookie`s into a single
// comma-separated value.
export function appendLegacySessionCookieClearHeaders(
  headers: Headers,
  request: Request,
) {
  for (const value of getSetCookieValues(
    createLegacySessionCookieClearHeaders(request),
  )) {
    headers.append("set-cookie", value);
  }

  return headers;
}

function getLegacySessionCookieNames(request: Request) {
  const cookieHeader = request.headers.get("cookie");

  if (!cookieHeader) {
    return [];
  }

  return Object.keys(parse(cookieHeader)).filter((name) =>
    name.startsWith(LEGACY_SESSION_COOKIE_PREFIX),
  );
}

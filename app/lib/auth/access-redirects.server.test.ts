import { describe, expect, test } from "vitest";

import { redirectToLoginForRequest } from "@/lib/auth/access-redirects.server";
import { getSetCookieValues } from "@/lib/auth/set-cookie-headers";

function redirectFor(cookie: string | null): Response {
  const request = new Request("http://localhost/panel", {
    headers: cookie ? { cookie } : undefined,
  });

  try {
    redirectToLoginForRequest(request);
  } catch (thrown) {
    if (!(thrown instanceof Response)) {
      throw thrown;
    }

    return thrown;
  }

  throw new Error("Expected redirectToLoginForRequest to throw a redirect.");
}

function motivoFor(cookie: string | null): string | null {
  const location = redirectFor(cookie).headers.get("location");

  return location
    ? new URL(location, "http://localhost").searchParams.get("motivo")
    : null;
}

describe("redirectToLoginForRequest", () => {
  test("marks `expirada` when there is an unprefixed session cookie (http baseURL)", () => {
    expect(motivoFor("better-auth.session_token=signed.token")).toBe(
      "expirada",
    );
  });

  test("marks `expirada` when the cookie carries the `__Secure-` prefix (https baseURL)", () => {
    // In production the baseURL is https, Better Auth turns on `useSecureCookies`
    // and emits `__Secure-better-auth.session_token`. Without recognizing the
    // prefix, an expired session showed `continuar` instead of `expirada` (#501).
    expect(motivoFor("__Secure-better-auth.session_token=signed.token")).toBe(
      "expirada",
    );
  });

  test("marks `continuar` when there is no session cookie", () => {
    expect(motivoFor(null)).toBe("continuar");
    expect(motivoFor("otra_cookie=1")).toBe("continuar");
  });

  // A migration shim (#582): a browser predating the auth cutover may still carry
  // `sb-*` cookies; the expired-session redirect expires them.
  test("expires the legacy `sb-*` cookies when redirecting an expired session", () => {
    const response = redirectFor("sb-project-auth-token=stale; theme=escena");

    expect(motivoFor("sb-project-auth-token=stale")).toBe("expirada");
    expect(getSetCookieValues(response.headers)).toEqual([
      "sb-project-auth-token=; Max-Age=0; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax",
    ]);
  });

  // The `continuar` branch emits no headers: with no session cookie there is
  // nothing to expire, and an `sb-*` cookie counts as a session, so it never
  // lands here.
  test("emits no `set-cookie` when it redirects with `continuar`", () => {
    expect(getSetCookieValues(redirectFor("theme=escena").headers)).toEqual([]);
  });
});

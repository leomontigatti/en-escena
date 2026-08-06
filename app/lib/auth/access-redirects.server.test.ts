import { describe, expect, test } from "vitest";

import { redirectToLoginForRequest } from "@/lib/auth/access-redirects.server";
import { getSetCookieValues } from "@/lib/auth/set-cookie-headers";

function motivoFor(cookie: string | null): string | null {
  const request = new Request("http://localhost/panel", {
    headers: cookie ? { cookie } : undefined,
  });

  try {
    redirectToLoginForRequest(request);
  } catch (thrown) {
    if (!(thrown instanceof Response)) {
      throw thrown;
    }

    const location = thrown.headers.get("location");
    return location
      ? new URL(location, "http://localhost").searchParams.get("motivo")
      : null;
  }

  throw new Error("Expected redirectToLoginForRequest to throw a redirect.");
}

describe("redirectToLoginForRequest", () => {
  test("marca `expirada` cuando hay cookie de sesión sin prefijo (baseURL http)", () => {
    expect(motivoFor("better-auth.session_token=signed.token")).toBe(
      "expirada",
    );
  });

  test("marca `expirada` cuando la cookie lleva el prefijo `__Secure-` (baseURL https)", () => {
    // En producción el baseURL es https, Better Auth activa `useSecureCookies` y
    // emite `__Secure-better-auth.session_token`. Sin reconocer el prefijo, a
    // una sesión vencida le aparecía `continuar` en vez de `expirada` (#501).
    expect(motivoFor("__Secure-better-auth.session_token=signed.token")).toBe(
      "expirada",
    );
  });

  test("marca `continuar` cuando no hay cookie de sesión", () => {
    expect(motivoFor(null)).toBe("continuar");
    expect(motivoFor("otra_cookie=1")).toBe("continuar");
  });

  // Shim de migración (#582): un navegador previo al cutover de auth todavía
  // puede traer cookies `sb-*`; la redirección de sesión vencida las expira.
  test("expira las cookies `sb-*` heredadas al redirigir una sesión vencida", () => {
    const request = new Request("http://localhost/panel", {
      headers: {
        cookie: "sb-project-auth-token=stale; theme=escena",
      },
    });

    try {
      redirectToLoginForRequest(request);
    } catch (thrown) {
      if (!(thrown instanceof Response)) {
        throw thrown;
      }

      expect(getSetCookieValues(thrown.headers)).toEqual([
        "sb-project-auth-token=; Max-Age=0; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax",
      ]);

      return;
    }

    throw new Error("Expected redirectToLoginForRequest to throw a redirect.");
  });
});

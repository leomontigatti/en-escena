import { describe, expect, test } from "vitest";

import { createLegacySessionCookieClearHeaders } from "@/lib/auth/legacy-session-cookies.server";
import { getSetCookieValues } from "@/lib/auth/set-cookie-headers";

// Shim de migración (#582): la única pieza del residuo de Supabase Auth que
// sigue corriendo en producción. Su retiro debe ser una decisión consciente, no
// un descuido, así que se prueba explícitamente.
describe("legacy session cookie shim", () => {
  test("expires pre-cutover sb-* cookies without touching app cookies", () => {
    const request = new Request("http://localhost/registro", {
      headers: {
        cookie:
          "theme=escena; sb-project-auth-token=stale; sb-project-code-verifier=old",
      },
    });

    const headers = createLegacySessionCookieClearHeaders(request);

    expect(getSetCookieValues(headers)).toEqual([
      "sb-project-auth-token=; Max-Age=0; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax",
      "sb-project-code-verifier=; Max-Age=0; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax",
    ]);
  });

  test("emits nothing when the request carries no legacy cookies", () => {
    const request = new Request("http://localhost/registro", {
      headers: { cookie: "better-auth.session_token=vigente" },
    });

    expect(
      getSetCookieValues(createLegacySessionCookieClearHeaders(request)),
    ).toEqual([]);
  });
});

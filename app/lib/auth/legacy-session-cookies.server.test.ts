import { describe, expect, test } from "vitest";

import {
  appendLegacySessionCookieClearHeaders,
  createLegacySessionCookieClearHeaders,
} from "@/lib/auth/legacy-session-cookies.server";
import { getSetCookieValues } from "@/lib/auth/set-cookie-headers";

// A migration shim (#582): the only piece of the Supabase Auth residue still
// running in production. Retiring it must be a conscious decision, not an
// oversight, so it is tested explicitly.
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

  test("emits nothing when the request carries no cookie header at all", () => {
    expect(
      getSetCookieValues(
        createLegacySessionCookieClearHeaders(
          new Request("http://localhost/registro"),
        ),
      ),
    ).toEqual([]);
  });

  // Logout expires the inherited ones on top of the provider's `set-cookie`s,
  // which are the ones that close the current session: neither may be lost.
  test("appends the expirations without dropping the caller's set-cookie headers", () => {
    const headers = new Headers();
    headers.append("set-cookie", "better-auth.session_token=; Max-Age=0");

    const merged = appendLegacySessionCookieClearHeaders(
      headers,
      new Request("http://localhost/salir", {
        headers: { cookie: "sb-project-auth-token=stale" },
      }),
    );

    expect(getSetCookieValues(merged)).toEqual([
      "better-auth.session_token=; Max-Age=0",
      "sb-project-auth-token=; Max-Age=0; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax",
    ]);
  });
});

import { describe, expect, test } from "vitest";

import {
  createSupabaseSessionClearHeaders,
  createSupabaseServerCookieBridge,
  withSupabaseSsrHeaders,
} from "@/lib/auth/supabase-auth-ssr.server";
import { getSetCookieValues } from "@/lib/auth/set-cookie-headers";

describe("supabase auth ssr helpers", () => {
  test("reads request cookies and applies set-cookie plus no-cache headers to React Router responses", () => {
    const request = new Request("http://localhost/ingresar", {
      headers: {
        cookie: "theme=escena; sb-access-token=abc%20123",
      },
    });
    const { cookies, responseHeaders } =
      createSupabaseServerCookieBridge(request);

    expect(cookies.getAll()).toEqual([
      { name: "theme", value: "escena" },
      { name: "sb-access-token", value: "abc 123" },
    ]);

    cookies.setAll?.(
      [
        {
          name: "sb-access-token",
          options: {
            httpOnly: true,
            maxAge: 60,
            path: "/",
            sameSite: "lax",
            secure: true,
          },
          value: "next-token",
        },
      ],
      {
        "Cache-Control":
          "private, no-cache, no-store, must-revalidate, max-age=0",
        Expires: "0",
        Pragma: "no-cache",
      },
    );

    const init = withSupabaseSsrHeaders(
      {
        headers: new Headers({
          location: "/portal",
        }),
      },
      responseHeaders,
    );
    const headers = new Headers(init.headers);

    expect(headers.get("location")).toBe("/portal");
    expect(getSetCookieValues(headers)).toEqual([
      "sb-access-token=next-token; Max-Age=60; Path=/; HttpOnly; Secure; SameSite=Lax",
    ]);
    expect(headers.get("cache-control")).toBe(
      "private, no-cache, no-store, must-revalidate, max-age=0",
    );
    expect(headers.get("expires")).toBe("0");
    expect(headers.get("pragma")).toBe("no-cache");
  });

  test("preserves existing set-cookie headers when Supabase adds more", () => {
    const supabaseHeaders = new Headers();
    supabaseHeaders.append("set-cookie", "sb-refresh=2; Path=/; HttpOnly");

    const init = withSupabaseSsrHeaders(
      {
        headers: new Headers({
          "set-cookie": "sb-access-token=1; Path=/; HttpOnly",
        }),
      },
      supabaseHeaders,
    );

    expect(getSetCookieValues(new Headers(init.headers))).toEqual([
      "sb-access-token=1; Path=/; HttpOnly",
      "sb-refresh=2; Path=/; HttpOnly",
    ]);
  });

  test("expires stale Supabase auth cookies without touching app cookies", () => {
    const request = new Request("http://localhost/registro", {
      headers: {
        cookie:
          "theme=escena; sb-project-auth-token=stale; sb-project-code-verifier=old",
      },
    });

    const headers = createSupabaseSessionClearHeaders(request);

    expect(getSetCookieValues(headers)).toEqual([
      "sb-project-auth-token=; Max-Age=0; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax",
      "sb-project-code-verifier=; Max-Age=0; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax",
    ]);
  });
});

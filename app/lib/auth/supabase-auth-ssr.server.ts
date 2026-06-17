import {
  createServerClient,
  type CookieMethodsServer,
  type CookieOptions,
} from "@supabase/ssr";
import { parse, serialize } from "cookie";

type SupabaseCookie = {
  name: string;
  options: CookieOptions;
  value: string;
};

type SupabaseNoCacheHeaders = Record<string, string>;

export function createSupabaseServerClientForRequest(request: Request) {
  const { cookies, responseHeaders } =
    createSupabaseServerCookieBridge(request);

  return {
    client: createServerClient(
      getRequiredSupabaseEnv("SUPABASE_URL"),
      getRequiredSupabaseEnv("SUPABASE_PUBLISHABLE_KEY"),
      { cookies },
    ),
    responseHeaders,
  };
}

export function createSupabaseServerCookieBridge(request: Request) {
  const responseHeaders = new Headers();
  const cookies: CookieMethodsServer = {
    getAll() {
      return parseRequestCookies(request.headers.get("cookie"));
    },
    setAll(cookiesToSet: SupabaseCookie[], headers: SupabaseNoCacheHeaders) {
      for (const { name, value, options } of cookiesToSet) {
        responseHeaders.append("set-cookie", serialize(name, value, options));
      }

      for (const [name, value] of Object.entries(headers)) {
        responseHeaders.set(name, value);
      }
    },
  };

  return {
    cookies,
    responseHeaders,
  };
}

export function withSupabaseSsrHeaders(
  init: ResponseInit = {},
  supabaseHeaders: Headers = new Headers(),
) {
  return {
    ...init,
    headers: mergeHeaders(init.headers, supabaseHeaders),
  };
}

function mergeHeaders(
  baseHeaders: HeadersInit | undefined,
  supabaseHeaders: Headers,
) {
  const mergedHeaders = new Headers(baseHeaders);

  for (const [name, value] of supabaseHeaders) {
    if (name.toLowerCase() === "set-cookie") {
      continue;
    }

    mergedHeaders.set(name, value);
  }

  for (const value of getSetCookieValues(supabaseHeaders)) {
    mergedHeaders.append("set-cookie", value);
  }

  return mergedHeaders;
}

function parseRequestCookies(cookieHeader: string | null) {
  if (!cookieHeader) {
    return [];
  }

  return Object.entries(parse(cookieHeader)).flatMap(([name, value]) =>
    typeof value === "string" ? [{ name, value }] : [],
  );
}

function getRequiredSupabaseEnv(
  name: "SUPABASE_PUBLISHABLE_KEY" | "SUPABASE_URL",
) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required for Supabase Auth SSR.`);
  }

  return value;
}

function getSetCookieValues(headers: Headers) {
  if ("getSetCookie" in headers && typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }

  const setCookie = headers.get("set-cookie");

  return setCookie ? [setCookie] : [];
}

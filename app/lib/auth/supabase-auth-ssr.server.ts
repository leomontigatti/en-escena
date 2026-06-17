import {
  createServerClient,
  type CookieMethodsServer,
  type SetAllCookies,
} from "@supabase/ssr";
import { parse, serialize } from "cookie";

type SupabaseCookiesToSet = Parameters<SetAllCookies>[0];
type SupabaseResponseHeaderMap = Parameters<SetAllCookies>[1];

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
    setAll(cookiesToSet, headers) {
      appendSerializedCookies(responseHeaders, cookiesToSet);
      applySupabaseResponseHeaders(responseHeaders, headers);
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

  mergeNonCookieHeaders(mergedHeaders, supabaseHeaders);
  appendSetCookieValues(mergedHeaders, getSetCookieValues(supabaseHeaders));

  return mergedHeaders;
}

function appendSerializedCookies(
  headers: Headers,
  cookiesToSet: SupabaseCookiesToSet,
) {
  for (const { name, value, options } of cookiesToSet) {
    headers.append("set-cookie", serialize(name, value, options));
  }
}

function appendSetCookieValues(headers: Headers, values: string[]) {
  for (const value of values) {
    headers.append("set-cookie", value);
  }
}

function applySupabaseResponseHeaders(
  headers: Headers,
  responseHeaderMap: SupabaseResponseHeaderMap,
) {
  for (const [name, value] of Object.entries(responseHeaderMap)) {
    headers.set(name, value);
  }
}

function mergeNonCookieHeaders(targetHeaders: Headers, sourceHeaders: Headers) {
  for (const [name, value] of sourceHeaders) {
    if (isSetCookieHeader(name)) {
      continue;
    }

    targetHeaders.set(name, value);
  }
}

function isSetCookieHeader(name: string) {
  return name.toLowerCase() === "set-cookie";
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

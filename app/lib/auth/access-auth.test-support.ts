import { eq } from "drizzle-orm";

import { db } from "@/db";
import { accessSession, user } from "@/db/schema";
import {
  auth,
  SESSION_EXPIRES_IN_SECONDS,
  SESSION_UPDATE_AGE_SECONDS,
} from "@/lib/auth/access-auth-provider.betterauth.server";

// Test support for the DB suite: it creates users and sessions with **real
// Better Auth** against in-process PGlite (#422). It replaces our own test
// provider (`access-test-auth.server.ts`), keeping the same return contract
// (`{ headers, user, response }`) to minimize churn in the tests.

export const ACCESS_SESSION_EXPIRES_IN_SECONDS = SESSION_EXPIRES_IN_SECONDS;
export const ACCESS_SESSION_UPDATE_AGE_SECONDS = SESSION_UPDATE_AGE_SECONDS;

type CreatedAccessUser = {
  headers: Headers;
  response: { user: { email: string; id: string } };
  user: { email: string; id: string };
};

export async function createAccessUser(input: {
  email: string;
  name: string;
  password: string;
}): Promise<CreatedAccessUser> {
  const { headers, response } = await auth.api.signUpEmail({
    body: {
      email: input.email,
      name: input.name,
      password: input.password,
    },
    returnHeaders: true,
  });

  const created = {
    email: response.user.email,
    id: response.user.id,
  };

  return { headers, response: { user: created }, user: created };
}

export async function signInAccessUser(input: {
  email: string;
  password: string;
}): Promise<CreatedAccessUser> {
  const { headers, response } = await auth.api.signInEmail({
    body: { email: input.email, password: input.password },
    returnHeaders: true,
  });

  const signedIn = {
    email: response.user.email,
    id: response.user.id,
  };

  return { headers, response: { user: signedIn }, user: signedIn };
}

// The name of Better Auth's session cookie, with the optional `__Secure-`
// prefix. With an https baseURL (`useSecureCookies`), Better Auth emits the
// cookie as `__Secure-better-auth.session_token`; with http, without the prefix.
// The test helpers must derive the real name from the `set-cookie` instead of
// hardcoding it (#501).
const SESSION_COOKIE_SET_COOKIE_PATTERN =
  /(?:^|,\s*)((?:__Secure-)?better-auth\.session_token)=([^;]+)/;

function matchSessionSetCookie(headers: Headers): RegExpMatchArray {
  const match = headers
    .get("set-cookie")
    ?.match(SESSION_COOKIE_SET_COOKIE_PATTERN);

  if (!match?.[1] || !match[2]) {
    throw new Error("Expected access auth to return a session cookie.");
  }

  return match;
}

// The (signed) value of the session cookie Better Auth sets in `headers`,
// deriving the real name (with or without the `__Secure-` prefix) from the
// `set-cookie`.
export function extractSessionCookieValue(headers: Headers): string {
  return matchSessionSetCookie(headers)[2];
}

// The `cookie` header (`name=value`) for Better Auth's session cookie, keeping
// the real `__Secure-` prefix when there is one. It replaces the
// `createRequestCookie`s that hardcoded `better-auth.session_token` (#501).
export function createSessionRequestCookie(headers: Headers): string {
  const match = matchSessionSetCookie(headers);

  return `${match[1]}=${match[2]}`;
}

// Rebuilds a request's `cookie` header from the cookies Better Auth sets in
// `headers` (session + session cache), to simulate the browser in route tests.
export function createAccessRequestCookie(headers: Headers): string {
  const cookieHeader = readSetCookies(headers)
    .map((setCookie) => setCookie.split(";")[0]?.trim())
    .filter((pair): pair is string => Boolean(pair) && pair.includes("="))
    .join("; ");

  if (!cookieHeader) {
    throw new Error("Expected access auth to return a session cookie.");
  }

  return cookieHeader;
}

// Reads (and refreshes, per the `updateAge` policy) the Better Auth session of a
// request. Returns `null` if there is no session in force. It is the equivalent
// of `readLocalAccessSession` from the retired test provider.
export async function readAccessSession(headers: Headers) {
  const result = await auth.api.getSession({ headers });

  if (!result) {
    return null;
  }

  return {
    session: {
      expiresAt: result.session.expiresAt,
      id: result.session.id,
      issuedAt: result.session.createdAt ?? null,
      token: result.session.token,
    },
    user: {
      email: result.user.email,
      id: result.user.id,
    },
  };
}

export function findAccessSessionByUserId(userId: string) {
  return db.query.accessSession.findFirst({
    where: eq(accessSession.userId, userId),
  });
}

export function markAccessUserEmailVerified(userId: string) {
  return db
    .update(user)
    .set({ emailVerified: true })
    .where(eq(user.id, userId));
}

function readSetCookies(headers: Headers): string[] {
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] })
    .getSetCookie;

  if (typeof getSetCookie === "function") {
    return getSetCookie.call(headers);
  }

  const raw = headers.get("set-cookie");
  return raw ? [raw] : [];
}

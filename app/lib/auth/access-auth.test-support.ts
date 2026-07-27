import { eq } from "drizzle-orm";

import { db } from "@/db";
import { accessSession, user } from "@/db/schema";
import {
  auth,
  SESSION_EXPIRES_IN_SECONDS,
  SESSION_UPDATE_AGE_SECONDS,
} from "@/lib/auth/access-auth-provider.betterauth.server";

// Soporte de tests de la suite de DB: crea usuarios y sesiones con **Better Auth
// real** contra PGlite in-process (#422). Reemplaza el provider de test propio
// (`access-test-auth.server.ts`), manteniendo el mismo contrato de retorno
// (`{ headers, user, response }`) para minimizar el churn en los tests.

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

// Nombre de la cookie de sesión de Better Auth, con el prefijo `__Secure-`
// opcional. Con un baseURL https (`useSecureCookies`), Better Auth emite la
// cookie como `__Secure-better-auth.session_token`; con http, sin prefijo. Los
// helpers de test deben derivar el nombre real del `set-cookie` en vez de
// hardcodearlo (#501).
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

// Valor (firmado) de la cookie de sesión que Better Auth setea en `headers`,
// derivando el nombre real (con o sin prefijo `__Secure-`) del `set-cookie`.
export function extractSessionCookieValue(headers: Headers): string {
  return matchSessionSetCookie(headers)[2];
}

// Header `cookie` (`nombre=valor`) para la cookie de sesión de Better Auth,
// conservando el prefijo `__Secure-` real cuando lo hay. Reemplaza los
// `createRequestCookie` que hardcodeaban `better-auth.session_token` (#501).
export function createSessionRequestCookie(headers: Headers): string {
  const match = matchSessionSetCookie(headers);

  return `${match[1]}=${match[2]}`;
}

// Reconstruye el header `cookie` de un request a partir de las cookies que
// Better Auth setea en `headers` (sesión + caché de sesión), para simular al
// navegador en los tests de rutas.
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

// Lee (y refresca, según la política de `updateAge`) la sesión de Better Auth de
// un request. Devuelve `null` si no hay sesión vigente. Equivale al
// `readLocalAccessSession` del provider de test retirado.
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

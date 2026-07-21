import { and, eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { account, accessSession, user } from "@/db/schema";
import {
  auth,
  getBetterAuthAccessSession,
  getBetterAuthVerifiedAccessIdentity,
  readLatestBetterAuthResetToken,
} from "@/lib/auth/access-auth-provider.betterauth.server";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

const CREDENTIAL_PROVIDER_ID = "credential";

// La cobertura del handler HTTP va en el test real contra PGlite (no bajo
// `app/routes/`, que flatRoutes tomaría como ruta y rompería el build). Estos
// tests golpean `auth.api` / `auth.handler` con la tabla real.
describe("provider Better Auth", () => {
  test("registra credencial con hash scrypt y abre sesión de 8 h", async () => {
    const { headers } = await signUp({
      email: "alta@example.com",
      password: "password-segura",
    });

    const savedUser = await db.query.user.findFirst({
      where: eq(user.email, "alta@example.com"),
    });
    expect(savedUser?.id).toBeTruthy();

    const credential = await db.query.account.findFirst({
      where: and(
        eq(account.userId, savedUser!.id),
        eq(account.providerId, CREDENTIAL_PROVIDER_ID),
      ),
    });
    expect(credential?.password).toBeTruthy();
    // Hash scrypt nativo de Better Auth: nunca la contraseña en claro.
    expect(credential?.password).not.toContain("password-segura");

    const session = await getBetterAuthAccessSession(
      requestWithCookies(headers),
    );
    expect(session?.user.email).toBe("alta@example.com");
    expect(session?.user.id).toBe(savedUser!.id);
    expect(session?.session.issuedAt).toBeInstanceOf(Date);

    const savedSession = await db.query.accessSession.findFirst({
      where: eq(accessSession.userId, savedUser!.id),
    });
    const ttlMs =
      savedSession!.expiresAt.getTime() - savedSession!.createdAt.getTime();
    // 8 h de vida, con margen por el redondeo del reloj.
    expect(Math.round(ttlMs / 1000)).toBe(8 * 60 * 60);
  });

  test("inicia sesión con la contraseña correcta y rechaza la incorrecta", async () => {
    await signUp({ email: "login@example.com", password: "password-segura" });

    const { headers, response } = await auth.api.signInEmail({
      body: { email: "login@example.com", password: "password-segura" },
      returnHeaders: true,
    });
    expect(response.user.email).toBe("login@example.com");

    const identity = await getBetterAuthVerifiedAccessIdentity(
      requestWithCookies(headers),
    );
    expect(identity?.user.email).toBe("login@example.com");

    await expect(
      auth.api.signInEmail({
        body: { email: "login@example.com", password: "password-incorrecta" },
      }),
    ).rejects.toThrow();
  });

  test("cierra la sesión activa", async () => {
    const { headers } = await signUp({
      email: "salir@example.com",
      password: "password-segura",
    });
    const signedInRequest = requestWithCookies(headers);

    const { headers: signOutHeaders } = await auth.api.signOut({
      headers: signedInRequest.headers,
      returnHeaders: true,
    });

    const afterSignOut = await getBetterAuthAccessSession(
      requestWithCookies(signOutHeaders, signedInRequest),
    );
    expect(afterSignOut).toBeNull();
  });

  test("expone el token de reset por la tabla verification y lo aplica", async () => {
    const { response } = await signUp({
      email: "reset@example.com",
      password: "password-vieja",
    });

    await auth.api.requestPasswordReset({
      body: {
        email: "reset@example.com",
        redirectTo: "http://localhost:5173/cambiar-contrasena",
      },
    });

    const token = await readLatestBetterAuthResetToken(response.user.id);
    expect(token).toBeTruthy();

    await auth.api.resetPassword({
      body: { newPassword: "password-nueva", token: token! },
    });

    await expect(
      auth.api.signInEmail({
        body: { email: "reset@example.com", password: "password-vieja" },
      }),
    ).rejects.toThrow();

    const { response: signInResponse } = await auth.api.signInEmail({
      body: { email: "reset@example.com", password: "password-nueva" },
      returnHeaders: true,
    });
    expect(signInResponse.user.email).toBe("reset@example.com");
  });
});

async function signUp(input: { email: string; password: string }) {
  return auth.api.signUpEmail({
    body: {
      email: input.email,
      name: input.email,
      password: input.password,
    },
    returnHeaders: true,
  });
}

// Reconstruye un Request con las cookies que Better Auth setea en `headers`.
// Fusiona opcionalmente con las cookies de un request previo para simular el
// navegador (p. ej. la cookie de sesión ya presente al cerrar sesión).
function requestWithCookies(headers: Headers, previous?: Request) {
  const cookies = new Map<string, string>();

  if (previous) {
    for (const [name, value] of parseCookieHeader(
      previous.headers.get("cookie"),
    )) {
      cookies.set(name, value);
    }
  }

  for (const setCookie of readSetCookies(headers)) {
    const [pair] = setCookie.split(";");
    const separatorIndex = pair.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const name = pair.slice(0, separatorIndex).trim();
    const value = pair.slice(separatorIndex + 1).trim();

    if (value === "") {
      cookies.delete(name);
    } else {
      cookies.set(name, value);
    }
  }

  const cookieHeader = Array.from(cookies.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");

  return new Request("http://localhost:5173/", {
    headers: cookieHeader ? { cookie: cookieHeader } : {},
  });
}

function readSetCookies(headers: Headers) {
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] })
    .getSetCookie;

  if (typeof getSetCookie === "function") {
    return getSetCookie.call(headers);
  }

  const raw = headers.get("set-cookie");
  return raw ? [raw] : [];
}

function parseCookieHeader(cookieHeader: string | null) {
  const entries: Array<[string, string]> = [];

  for (const part of (cookieHeader ?? "").split(";")) {
    const separatorIndex = part.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    entries.push([
      part.slice(0, separatorIndex).trim(),
      part.slice(separatorIndex + 1).trim(),
    ]);
  }

  return entries;
}

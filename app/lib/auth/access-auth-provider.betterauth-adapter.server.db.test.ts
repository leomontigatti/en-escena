import { randomBytes, scryptSync } from "node:crypto";

import { and, eq, like } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { account, accessSession, user, verification } from "@/db/schema";
import { createBetterAuthAccessAuthProvider } from "@/lib/auth/access-auth-provider.betterauth.server";
import {
  createAccessRequestCookie,
  createAccessUser,
} from "@/lib/auth/access-auth.test-support";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

const provider = createBetterAuthAccessAuthProvider();

describe("Better Auth AccessAuthProvider adapter", () => {
  test("defers user creation on email sign-up until confirmation", async () => {
    const { debugConfirmationTokenHash } = await provider.startEmailSignUp({
      email: "alta@example.com",
      password: "password-segura",
      redirectTo: "http://localhost/registro/confirmar",
      request: new Request("http://localhost/registro"),
    });

    expect(debugConfirmationTokenHash).toEqual(expect.any(String));
    expect(
      await db.query.user.findFirst({
        where: eq(user.email, "alta@example.com"),
      }),
    ).toBeUndefined();

    const confirmation = await provider.confirmEmailOtp({
      request: new Request("http://localhost/registro/confirmar"),
      tokenHash: debugConfirmationTokenHash!,
      type: "signup",
    });

    const confirmedUser = await db.query.user.findFirst({
      where: eq(user.email, "alta@example.com"),
    });
    expect(confirmedUser?.emailVerified).toBe(true);
    expect(confirmation.userId).toBe(confirmedUser!.id);

    const session = await provider.getAccessSession(
      requestWithCookies(confirmation.headers),
    );
    expect(session?.user.email).toBe("alta@example.com");
  });

  test("recovers the password through the code exchange and revokes sessions", async () => {
    const created = await createAccessUser({
      email: "reset@example.com",
      name: "reset@example.com",
      password: "password-vieja",
    });
    await db
      .update(user)
      .set({ emailVerified: true, role: "academy" })
      .where(eq(user.id, created.user.id));

    const resetResult = await provider.requestPasswordReset({
      email: "reset@example.com",
      redirectTo: "http://localhost/cambiar-contrasena",
      request: new Request("http://localhost/recuperar-acceso"),
    });
    expect(resetResult.debugRecoveryCode).toEqual(expect.any(String));

    const exchange = await provider.exchangePasswordRecoveryCode({
      code: resetResult.debugRecoveryCode!,
      redirectTo: "http://localhost/cambiar-contrasena?recuperacion=1",
      request: new Request("http://localhost/cambiar-contrasena"),
    });

    await provider.updatePasswordForRecovery({
      newPassword: "password-nueva",
      request: requestWithCookies(exchange.headers),
    });

    expect(
      await db.query.accessSession.findMany({
        where: eq(accessSession.userId, created.user.id),
      }),
    ).toEqual([]);

    const signIn = await provider.signInCredentialUser({
      email: "reset@example.com",
      password: "password-nueva",
      request: new Request("http://localhost/ingresar"),
    });
    expect(signIn.userId).toBe(created.user.id);
  });

  test("persists the pending sign-up in `verification` without the plaintext password", async () => {
    const { debugConfirmationTokenHash } = await provider.startEmailSignUp({
      email: "persistida@example.com",
      password: "password-en-claro",
      redirectTo: "http://localhost/registro/confirmar",
      request: new Request("http://localhost/registro"),
    });

    const pendingRows = await db.query.verification.findMany({
      where: like(verification.identifier, "academy-signup:%"),
    });
    expect(pendingRows).toHaveLength(1);
    expect(pendingRows[0]?.identifier).toBe(
      `academy-signup:${debugConfirmationTokenHash}`,
    );
    // El password no queda en claro en reposo (cifrado con el secret de la app).
    expect(pendingRows[0]?.value).not.toContain("password-en-claro");
    expect(pendingRows[0]?.expiresAt.getTime()).toBeGreaterThan(Date.now());

    // Confirmar consume la fila y materializa el usuario.
    await provider.confirmEmailOtp({
      request: new Request("http://localhost/registro/confirmar"),
      tokenHash: debugConfirmationTokenHash!,
      type: "signup",
    });
    expect(
      await db.query.verification.findMany({
        where: like(verification.identifier, "academy-signup:%"),
      }),
    ).toEqual([]);
  });

  test("verifies a legacy `scrypt:<salt>:<hash>` credential migrated from access_credential", async () => {
    const created = await createAccessUser({
      email: "legacy@example.com",
      name: "legacy@example.com",
      password: "irrelevante-se-sobrescribe",
    });

    // Simula una credencial migrada por 0002: hash en el formato legacy de
    // `createLocalAccessPasswordHash` (scryptSync por defecto, keylen 64, salt hex).
    const salt = randomBytes(16).toString("hex");
    const legacyHash = `scrypt:${salt}:${scryptSync("password-legacy", salt, 64).toString("hex")}`;
    await db
      .update(account)
      .set({ password: legacyHash })
      .where(
        and(
          eq(account.userId, created.user.id),
          eq(account.providerId, "credential"),
        ),
      );

    const signIn = await provider.signInCredentialUser({
      email: "legacy@example.com",
      password: "password-legacy",
      request: new Request("http://localhost/ingresar"),
    });
    expect(signIn.userId).toBe(created.user.id);
  });

  test("rejects an unknown recovery code", async () => {
    await expect(
      provider.exchangePasswordRecoveryCode({
        code: "codigo-inexistente",
        redirectTo: "http://localhost/cambiar-contrasena",
        request: new Request("http://localhost/cambiar-contrasena"),
      }),
    ).rejects.toThrow();
  });
});

function requestWithCookies(headers: Headers) {
  return new Request("http://localhost/", {
    headers: { cookie: createAccessRequestCookie(headers) },
  });
}

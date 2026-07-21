import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { accessSession, user } from "@/db/schema";
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

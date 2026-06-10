import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { academies, session, user, verification } from "@/db/schema";
import { auth } from "@/lib/auth.server";
import {
  requestAccessRecoveryEmail,
  resetAccessPassword,
} from "@/lib/access-recovery.server";
import { action as resetPasswordAction } from "@/routes/recuperar-acceso.nueva";

import { installDatabaseTestHooks } from "../../tests/db/harness";

installDatabaseTestHooks();

describe("access recovery", () => {
  test("lets an existing user define a new password without creating academy data or changing role", async () => {
    const signUpResult = await auth.api.signUpEmail({
      body: {
        email: "usuario@example.com",
        name: "Usuario",
        password: "old-password",
      },
    });

    await db
      .update(user)
      .set({ emailVerified: true, role: "judge" })
      .where(eq(user.id, signUpResult.user.id));

    await requestAccessRecoveryEmail({
      email: "usuario@example.com",
      requestUrl: "http://localhost:3000/recuperar-acceso",
    });

    const resetToken = await db.query.verification.findFirst({
      where: eq(verification.value, signUpResult.user.id),
    });

    expect(resetToken?.identifier).toMatch(/^reset-password:/);

    const rawToken = resetToken?.identifier.replace("reset-password:", "");

    expect(rawToken).toBeTruthy();

    const result = await resetAccessPassword({
      token: rawToken ?? "",
      newPassword: "new-password",
      request: new Request("http://localhost:3000/recuperar-acceso/nueva"),
    });

    expect(result).toEqual({ ok: true });

    await expect(
      auth.api.signInEmail({
        body: {
          email: "usuario@example.com",
          password: "new-password",
        },
      }),
    ).resolves.toMatchObject({
      user: { email: "usuario@example.com" },
    });

    const savedUser = await db.query.user.findFirst({
      where: eq(user.id, signUpResult.user.id),
    });
    const savedAcademies = await db.query.academies.findMany({
      where: eq(academies.userId, signUpResult.user.id),
    });

    expect(savedUser).toMatchObject({
      emailVerified: true,
      role: "judge",
    });
    expect(savedAcademies).toEqual([]);
  });

  test("revokes existing sessions and redirects to login after a successful password reset", async () => {
    const { rawToken, sessionCookie, userId } =
      await createRecoverySessionState("revocar-sesiones@example.com");

    await auth.api.signInEmail({
      body: {
        email: "revocar-sesiones@example.com",
        password: "old-password",
      },
      returnHeaders: true,
    });

    expect(
      await db.query.session.findMany({
        where: eq(session.userId, userId),
      }),
    ).toHaveLength(2);

    const response = await expectThrownResponse(
      submitResetPasswordAction({
        token: rawToken,
        password: "new-password",
      }),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/ingresar?recuperacion=ok");
    expect(
      await db.query.session.findMany({
        where: eq(session.userId, userId),
      }),
    ).toEqual([]);
    await expect(
      auth.api.getSession({
        headers: new Headers({ cookie: sessionCookie }),
      }),
    ).resolves.toBeNull();
    await expect(
      auth.api.signInEmail({
        body: {
          email: "revocar-sesiones@example.com",
          password: "new-password",
        },
      }),
    ).resolves.toMatchObject({
      user: { email: "revocar-sesiones@example.com" },
    });
  });

  test("keeps the existing error behavior and sessions when the reset token expired", async () => {
    const { rawToken, userId } = await createRecoverySessionState(
      "token-expirado@example.com",
    );

    await db
      .update(verification)
      .set({ expiresAt: new Date(Date.now() - 1_000) })
      .where(eq(verification.identifier, `reset-password:${rawToken}`));

    const result = await submitResetPasswordAction({
      token: rawToken,
      password: "new-password",
    });

    expect(result).toEqual({
      status: "error",
      message:
        "El enlace no es válido o expiró. Pedí uno nuevo para recuperar el acceso.",
      fieldErrors: {
        password: undefined,
        confirmPassword: undefined,
      },
    });
    expect(
      await db.query.session.findMany({
        where: eq(session.userId, userId),
      }),
    ).toHaveLength(1);
  });
});

async function createRecoverySessionState(email: string) {
  const signUpResult = await auth.api.signUpEmail({
    body: {
      email,
      name: email,
      password: "old-password",
    },
    returnHeaders: true,
  });

  await db
    .update(user)
    .set({ emailVerified: true })
    .where(eq(user.id, signUpResult.response.user.id));

  await requestAccessRecoveryEmail({
    email,
    requestUrl: "http://localhost:3000/recuperar-acceso",
  });

  const resetToken = await db.query.verification.findFirst({
    where: eq(verification.value, signUpResult.response.user.id),
  });
  const rawToken = resetToken?.identifier.replace("reset-password:", "");

  if (!rawToken) {
    throw new Error("Expected reset token to exist.");
  }

  return {
    rawToken,
    sessionCookie: createRequestCookie(signUpResult.headers),
    userId: signUpResult.response.user.id,
  };
}

function submitResetPasswordAction(input: { token: string; password: string }) {
  const formData = new FormData();
  formData.set("token", input.token);
  formData.set("password", input.password);
  formData.set("confirmPassword", input.password);

  return resetPasswordAction({
    url: new URL("http://localhost/recuperar-acceso/nueva"),
    pattern: "/recuperar-acceso/nueva",
    request: new Request("http://localhost/recuperar-acceso/nueva", {
      method: "POST",
      body: formData,
    }),
    params: {},
    context: {},
  });
}

async function expectThrownResponse(resultPromise: Promise<unknown>) {
  try {
    await resultPromise;
  } catch (error) {
    expect(error).toBeInstanceOf(Response);
    return error as Response;
  }

  throw new Error("Expected a response to be thrown.");
}

function createRequestCookie(headers: Headers) {
  const setCookie = headers.get("set-cookie");
  const sessionCookie = setCookie?.match(/better-auth\.session_token=([^;]+)/);

  if (!sessionCookie?.[1]) {
    throw new Error("Expected Better Auth to return a session cookie.");
  }

  return `better-auth.session_token=${sessionCookie[1]}`;
}

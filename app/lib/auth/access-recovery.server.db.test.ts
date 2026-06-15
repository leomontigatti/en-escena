import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { academies, session, user, verification } from "@/db/schema";
import { auth } from "@/lib/auth/auth.server";
import {
  requestAccessRecoveryEmail,
  resetAccessPassword,
} from "@/lib/auth/access-recovery.server";
import { action as resetPasswordAction } from "@/routes/recuperar-acceso_.nueva";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

const sentEmails = vi.hoisted(
  () =>
    [] as Array<{
      to: string;
      subject: string;
      text: string;
    }>,
);

vi.mock("@/lib/shared/email.server", () => ({
  sendEmail: vi.fn(async (input) => {
    sentEmails.push(input);
  }),
}));

const OLD_PASSWORD = "old-password";
const NEW_PASSWORD = "new-password";
const RESET_PASSWORD_PATH = "/recuperar-acceso/nueva";
const RESET_PASSWORD_ACTION_URL = `http://localhost${RESET_PASSWORD_PATH}`;
const RECOVERY_REQUEST_URL = "http://localhost:3000/recuperar-acceso";
const RESET_PASSWORD_REQUEST_URL = new URL(
  RESET_PASSWORD_PATH,
  RECOVERY_REQUEST_URL,
).toString();
const EXPIRED_RESET_TOKEN_MESSAGE =
  "El enlace no es válido o expiró. Pedí uno nuevo para recuperar el acceso.";

installDatabaseTestHooks();

describe("access recovery", () => {
  beforeEach(() => {
    sentEmails.length = 0;
  });

  test("lets an existing user define a new password without creating academy data or changing role", async () => {
    const signUpResult = await auth.api.signUpEmail({
      body: {
        email: "usuario@example.com",
        name: "Usuario",
        password: OLD_PASSWORD,
      },
    });

    await db
      .update(user)
      .set({ emailVerified: true, role: "judge" })
      .where(eq(user.id, signUpResult.user.id));

    await requestAccessRecoveryEmail({
      email: "usuario@example.com",
      requestUrl: RECOVERY_REQUEST_URL,
    });

    const rawToken = await findResetTokenForUser(signUpResult.user.id);
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]).toMatchObject({
      to: "usuario@example.com",
      subject: "Recuperá tu acceso a En Escena",
    });

    const result = await resetAccessPassword({
      token: rawToken,
      newPassword: NEW_PASSWORD,
      request: new Request(RESET_PASSWORD_REQUEST_URL),
    });

    expect(result).toEqual({ ok: true });

    await expect(
      auth.api.signInEmail({
        body: {
          email: "usuario@example.com",
          password: NEW_PASSWORD,
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
        password: OLD_PASSWORD,
      },
      returnHeaders: true,
    });

    await expect(findSessionsByUserId(userId)).resolves.toHaveLength(2);

    const response = await expectThrownResponse(
      submitResetPasswordAction({
        token: rawToken,
        password: NEW_PASSWORD,
      }),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/ingresar?recuperacion=ok");
    await expect(findSessionsByUserId(userId)).resolves.toEqual([]);
    await expect(
      auth.api.getSession({
        headers: new Headers({ cookie: sessionCookie }),
      }),
    ).resolves.toBeNull();
    await expect(
      auth.api.signInEmail({
        body: {
          email: "revocar-sesiones@example.com",
          password: NEW_PASSWORD,
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
      password: NEW_PASSWORD,
    });

    expect(result).toEqual({
      status: "error",
      message: EXPIRED_RESET_TOKEN_MESSAGE,
      fieldErrors: {},
      values: {
        password: "",
        confirmPassword: "",
      },
    });
    await expect(findSessionsByUserId(userId)).resolves.toHaveLength(1);
  });
});

async function createRecoverySessionState(email: string) {
  const signUpResult = await auth.api.signUpEmail({
    body: {
      email,
      name: email,
      password: OLD_PASSWORD,
    },
    returnHeaders: true,
  });

  await db
    .update(user)
    .set({ emailVerified: true })
    .where(eq(user.id, signUpResult.response.user.id));

  const rawToken = await insertResetToken(signUpResult.response.user.id);

  return {
    rawToken,
    sessionCookie: createRequestCookie(signUpResult.headers),
    userId: signUpResult.response.user.id,
  };
}

async function insertResetToken(userId: string) {
  const rawToken = crypto.randomUUID();

  await db.insert(verification).values({
    identifier: `reset-password:${rawToken}`,
    value: userId,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });

  return rawToken;
}

async function findResetTokenForUser(userId: string) {
  const resetToken = await db.query.verification.findFirst({
    where: eq(verification.value, userId),
  });

  if (!resetToken?.identifier.startsWith("reset-password:")) {
    throw new Error("Expected reset token to exist.");
  }

  return resetToken.identifier.replace("reset-password:", "");
}

function findSessionsByUserId(userId: string) {
  return db.query.session.findMany({
    where: eq(session.userId, userId),
  });
}

function submitResetPasswordAction(input: { token: string; password: string }) {
  const formData = new FormData();
  formData.set("token", input.token);
  formData.set("password", input.password);
  formData.set("confirmPassword", input.password);

  return resetPasswordAction({
    url: new URL(RESET_PASSWORD_ACTION_URL),
    pattern: RESET_PASSWORD_PATH,
    request: new Request(RESET_PASSWORD_ACTION_URL, {
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
    if (error instanceof Response) {
      return error;
    }

    throw error;
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
